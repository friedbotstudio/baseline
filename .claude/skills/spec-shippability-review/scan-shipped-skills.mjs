#!/usr/bin/env node
// spec-shippability-review — aggregate scanner for shipped SKILL.md files.
//
// Walks every <root>/<slug>/SKILL.md (default root: obj/template/.claude/skills),
// extracts shell fences from each, runs C1 (DEV_TREE_RUNTIME_REF) + C3
// (UNSHIPPED_MODULE_IMPORT) against them via analyzer.mjs, aggregates findings
// into one report at <report-root>/.claude/state/spec-shippability/shipped-skills.json,
// prints a human-readable summary, and exits 0 (CLEAN) / 1 (NEEDS_REVIEW) /
// 2 (BLOCKED) / 3 (missing root).
//
// Wired into scripts/build-template.sh Stage 1.6 so a baseline-owned SKILL.md
// that references dev-tree paths or unshipped modules cannot reach npm.
// Complements check.mjs: check.mjs validates per-slug spec drafts before they
// ship; this scanner backstops by re-validating the actual shipped SKILL.md
// content at build time.
//
// Spec: docs/specs/marker-helper-shipped-instead-of-dev-import.md

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve, relative } from 'node:path';
import {
  collectMarkdownCode,
  collectHelperFileContent,
  runDevTreeAndUnshippedChecks,
} from './analyzer.mjs';

const DEFAULT_ROOT_REL = 'obj/template/.claude/skills';
const DEFAULT_MANIFEST_REL = 'obj/template/.claude/manifest.json';
const REPORT_REL = '.claude/state/spec-shippability/shipped-skills.json';

const USAGE = `usage: node scan-shipped-skills.mjs [--root <skills-dir>] [--report-root <project-root>] [--manifest <path> | --shipped-tree <dir>]`;

async function main(argv) {
  const args = parseArgs(argv);
  const root = resolve(args.root ?? DEFAULT_ROOT_REL);
  const reportRoot = resolve(args.reportRoot ?? '.');

  if (!existsSync(root)) {
    process.stderr.write(`scan-shipped-skills: missing root ${root} (ENOENT)\n${USAGE}\n`);
    return 3;
  }

  const manifest = await resolveManifest(args, reportRoot);
  const findings = await scanRoot(root, manifest, reportRoot);
  const report = buildReport(root, findings);
  await writeReport(reportRoot, report);
  printSummary(report);
  return verdictToExitCode(report.verdict);
}

function parseArgs(argv) {
  const args = { root: null, reportRoot: null, manifest: null, shippedTree: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') args.root = argv[++i];
    else if (a === '--report-root') args.reportRoot = argv[++i];
    else if (a === '--manifest') args.manifest = argv[++i];
    else if (a === '--shipped-tree') args.shippedTree = argv[++i];
  }
  return args;
}

async function resolveManifest(args, reportRoot) {
  if (args.shippedTree) return manifestFromTreeWalk(resolve(args.shippedTree));
  const path = args.manifest ? resolve(args.manifest) : resolveDefaultManifest(reportRoot);
  return loadShippedManifest(path);
}

function resolveDefaultManifest(reportRoot) {
  const consumerPath = join(reportRoot, '.claude/manifest.json');
  if (existsSync(consumerPath)) return consumerPath;
  return join(reportRoot, DEFAULT_MANIFEST_REL);
}

async function loadShippedManifest(path) {
  if (!existsSync(path)) return { files: {} };
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return { files: {} };
  }
}

async function manifestFromTreeWalk(treeRoot) {
  const files = {};
  for await (const rel of walkFiles(treeRoot, '')) {
    files[`.claude/${rel}`] = '';
  }
  return { files };
}

async function* walkFiles(absRoot, relPrefix) {
  let entries;
  try {
    entries = await readdir(absRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      yield* walkFiles(join(absRoot, entry.name), relPath);
    } else if (entry.isFile()) {
      yield relPath;
    }
  }
}

const HELPER_FILE_EXTS = new Set(['.mjs', '.js', '.sh', '.py']);

async function scanRoot(root, manifest, reportRoot) {
  const scannableFiles = await findScannableFiles(root);
  const findings = [];
  for (const absPath of scannableFiles) {
    const sourcePath = relative(reportRoot, absPath) || absPath;
    const text = await readFile(absPath, 'utf8');
    const chunks = collectChunksForFile(absPath, text);
    findings.push(...runDevTreeAndUnshippedChecks(chunks, manifest, sourcePath));
  }
  return findings;
}

function collectChunksForFile(absPath, text) {
  const ext = extname(absPath);
  if (ext === '.md') return collectMarkdownCode(text);
  if (HELPER_FILE_EXTS.has(ext)) return collectHelperFileContent(text);
  return [];
}

async function findScannableFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(root, entry.name);
    if (!(await isBaselineOwnedSkill(skillDir))) continue;
    for (const file of await topLevelScannableFiles(skillDir)) {
      out.push(file);
    }
  }
  return out.sort();
}

async function isBaselineOwnedSkill(skillDir) {
  const skillMd = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMd)) return false;
  let text;
  try {
    text = await readFile(skillMd, 'utf8');
  } catch {
    return false;
  }
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return false;
  return /^owner:\s+baseline\s*$/m.test(fmMatch[1]);
}

async function topLevelScannableFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isScannableFile(entry.name)) continue;
    out.push(join(dir, entry.name));
  }
  return out;
}

function isScannableFile(name) {
  const ext = extname(name);
  return ext === '.md' || HELPER_FILE_EXTS.has(ext);
}

function buildReport(root, findings) {
  return {
    slug: 'shipped-skills',
    spec_path: root,
    verdict: deriveVerdict(findings),
    generated_at: new Date().toISOString(),
    findings,
  };
}

function deriveVerdict(findings) {
  if (findings.some((f) => f.severity === 'BLOCKER')) return 'BLOCKED';
  if (findings.length > 0) return 'NEEDS_REVIEW';
  return 'CLEAN';
}

async function writeReport(reportRoot, report) {
  const outPath = join(reportRoot, REPORT_REL);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(report, null, 2) + '\n');
}

function printSummary(report) {
  const counts = report.findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, { BLOCKER: 0, ADVISORY: 0 });
  process.stdout.write(`# scan-shipped-skills — ${report.spec_path}\n\n`);
  process.stdout.write(`Verdict: ${report.verdict}\n`);
  process.stdout.write(`BLOCKER: ${counts.BLOCKER}  ·  ADVISORY: ${counts.ADVISORY}\n\n`);
  for (const f of report.findings) {
    process.stdout.write(`${f.severity}  ${f.check}\n`);
    process.stdout.write(`  ${f.file}${f.line ? ':' + f.line : ''}\n`);
    if (f.evidence) process.stdout.write(`  evidence: ${f.evidence}\n`);
    process.stdout.write(`  ${f.message}\n`);
    process.stdout.write(`  fix: ${f.suggested_fix}\n\n`);
  }
}

function verdictToExitCode(verdict) {
  return verdict === 'BLOCKED' ? 2 : verdict === 'NEEDS_REVIEW' ? 1 : 0;
}

const code = await main(process.argv.slice(2));
process.exit(code);
