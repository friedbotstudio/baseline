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
import { pathToFileURL } from 'node:url';
import {
  collectMarkdownCode,
  collectHelperFileContent,
  runDevTreeAndUnshippedChecks,
} from './analyzer.mjs';

const DEFAULT_ROOT_REL = 'obj/template/.claude/skills';
const DEFAULT_MANIFEST_REL = 'obj/template/.claude/manifest.json';
const REPORT_REL = '.claude/state/spec-shippability/shipped-skills.json';
const SHIPPED_CLAUDE_REL = 'obj/template/.claude';

const USAGE = `usage: node scan-shipped-skills.mjs [--root <skills-dir>] [--report-root <project-root>] [--manifest <path> | --shipped-tree <dir>]`;

async function main(argv) {
  const args = parseArgs(argv);
  const skillsRoot = resolve(args.root ?? DEFAULT_ROOT_REL);
  const reportRoot = resolve(args.reportRoot ?? '.');

  // An EXPLICIT --root that does not exist stays a hard 3: the caller named a
  // path and was wrong. A descriptor root that is merely absent records a skip,
  // because a consumer tree legitimately lacks some shipped directories.
  if (args.root && !existsSync(skillsRoot)) {
    process.stderr.write(`scan-shipped-skills: missing root ${skillsRoot} (ENOENT)\n${USAGE}\n`);
    return 3;
  }

  const manifest = await resolveManifest(args, reportRoot);
  const { findings, scanned, skipped } = await scanRoots(resolveDescriptors(skillsRoot), manifest, reportRoot);
  const report = buildReport(skillsRoot, findings);
  await writeReport(reportRoot, report);
  printCoverage(scanned, skipped);
  printSummary(report);
  return verdictToExitCode(report.verdict);
}

// --root overrides ONLY the skills descriptor. Every other descriptor keeps
// resolving under the shipped tree, so the build gate and the per-slug adapter
// (which both pass --root) still get commands coverage.
function resolveDescriptors(skillsRoot) {
  return SCAN_ROOTS.map((descriptor) => ({
    ...descriptor,
    root: descriptor.id === 'skills' ? skillsRoot : resolve(join(SHIPPED_CLAUDE_REL, descriptor.dir)),
  }));
}

async function scanRoots(descriptors, manifest, reportRoot) {
  const findings = [];
  const scanned = [];
  const skipped = [];
  for (const descriptor of descriptors) {
    if (!existsSync(descriptor.root)) {
      skipped.push(descriptor);
      process.stdout.write(`scan-shipped-skills: skipped ${descriptor.id} (missing ${descriptor.root})\n`);
      continue;
    }
    scanned.push(descriptor);
    findings.push(...(await scanDescriptor(descriptor, manifest, reportRoot)));
  }
  return { findings, scanned, skipped };
}

function printCoverage(scanned, skipped) {
  const ids = scanned.map((d) => d.id).join(', ');
  process.stdout.write(
    `scan-shipped-skills: ${scanned.length} descriptor(s) scanned [${ids}], ` +
      `${skipped.length} skipped, ${Object.keys(SCAN_EXEMPTIONS).length} exempt\n`,
  );
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

async function scanDescriptor(descriptor, manifest, reportRoot) {
  const findings = [];
  for (const absPath of await descriptor.finder(descriptor.root)) {
    const sourcePath = relative(reportRoot, absPath) || absPath;
    const text = await readFile(absPath, 'utf8');
    const chunks = collectChunksForFile(absPath, text);
    findings.push(
      ...runDevTreeAndUnshippedChecks(chunks, manifest, sourcePath, { strictDevPaths: descriptor.strictDevPaths }),
    );
  }
  return findings;
}

function collectChunksForFile(absPath, text) {
  const ext = extname(absPath);
  if (ext === '.md') return collectMarkdownCode(text);
  if (HELPER_FILE_EXTS.has(ext)) return collectHelperFileContent(text);
  return [];
}

// One descriptor per shipped surface that can carry a runtime path. This list
// replaced a single hardcoded skills root: `.claude/commands/` shipped unscanned,
// which is how an /init-project step telling a consumer install to read
// `src/agents/swarm-worker.template.md` reached users. `dir` is the shipped
// directory name so no-descriptor coverage can be asserted against the built
// tree; `strictDevPaths` opts a surface into the unprefixed dev-path form, and
// only recipe surfaces (commands) take it.
export const SCAN_ROOTS = Object.freeze([
  Object.freeze({ id: 'skills', dir: 'skills', finder: findScannableSkillFiles, strictDevPaths: false }),
  Object.freeze({ id: 'commands', dir: 'commands', finder: topLevelScannableFiles, strictDevPaths: true }),
  Object.freeze({ id: 'agents', dir: 'agents', finder: topLevelScannableFiles, strictDevPaths: false }),
  Object.freeze({ id: 'hooks', dir: 'hooks', finder: findNestedScannableFiles, strictDevPaths: false }),
  Object.freeze({ id: 'mcp', dir: 'mcp', finder: findNestedScannableFiles, strictDevPaths: false }),
  Object.freeze({ id: 'output-styles', dir: 'output-styles', finder: topLevelScannableFiles, strictDevPaths: false }),
]);

// A shipped directory is exempt only when it cannot carry a runtime path at all.
// Every entry states why, because a bare exemption is the silent gap with extra
// steps — the coverage test rejects an empty reason.
export const SCAN_EXEMPTIONS = Object.freeze({
  bin: 'vendored binaries and their licence files — no source text to scan',
  schemas: 'JSON Schema documents — data contracts, never invoked',
  memory: 'seeded memory stubs — project facts, not runtime instructions',
});

async function findScannableSkillFiles(root) {
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

async function findNestedScannableFiles(root) {
  const out = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await findNestedScannableFiles(path)));
    else if (entry.isFile() && isScannableFile(entry.name)) out.push(path);
  }
  return out.sort();
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
  return out.sort();
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

// Guarded so a test (or any caller) can import SCAN_ROOTS / SCAN_EXEMPTIONS
// without running a scan and exiting the host process. Same shape as
// audit-baseline/audit.mjs.
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (IS_MAIN) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}
