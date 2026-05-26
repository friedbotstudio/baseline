#!/usr/bin/env node
// spec-shippability-review — analyzer for the v0.8.1-class failure mode:
// shipped SKILL.md prose that references dev-only paths the consumer doesn't
// receive. See sibling SKILL.md for the failure mode + check semantics.
//
// Per-spec entry point: reads docs/specs/<slug>.md, extracts write_set + shell
// code fences, runs C1+C3 via analyzer.mjs and C2 locally, writes the punch
// list to .claude/state/spec-shippability/<slug>.json, prints a human-readable
// summary to stdout, exits 0 (CLEAN) / 1 (NEEDS_REVIEW) / 2 (BLOCKED).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { collectShellFences, runDevTreeAndUnshippedChecks } from './analyzer.mjs';

// AC-007 — backward-compat for per-spec report shape. After the analyzer.mjs
// extraction, this module still emits the same { slug, spec_path, verdict,
// generated_at, findings[] } shape so spec_approval_guard.sh continues to read
// per-slug reports unchanged. The aggregate scan-shipped-skills.mjs writes to
// a different key (shipped-skills.json) and does not collide.

const WRITE_SET_LINE_RE = /^[\s|*-]*([./][\w./-]+\.(?:py|mjs|js|sh|md|json))\s*(?:\||$)/gm;

const usage = 'usage: node check.mjs <slug> [--project-root <path>]';

async function main(argv) {
  const args = parseArgs(argv);
  if (!args.slug) {
    process.stderr.write(usage + '\n');
    process.exit(2);
  }
  const projectRoot = resolve(args.projectRoot ?? '.');
  const report = await analyzeSpec(projectRoot, args.slug);
  await writeReport(projectRoot, args.slug, report);
  printSummary(report);
  return verdictToExitCode(report.verdict);
}

function parseArgs(argv) {
  const args = { slug: null, projectRoot: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project-root') args.projectRoot = argv[++i];
    else if (!args.slug && !a.startsWith('--')) args.slug = a;
  }
  return args;
}

async function analyzeSpec(projectRoot, slug) {
  const specPath = `docs/specs/${slug}.md`;
  const specAbs = join(projectRoot, specPath);
  if (!existsSync(specAbs)) {
    return emptyReport(slug, specPath, 'BLOCKED', [{
      severity: 'BLOCKER', check: 'SPEC_MISSING', file: specPath, line: null,
      evidence: '', message: `Spec file not found at ${specPath}`,
      suggested_fix: 'Run /spec to draft the spec, or pass the correct slug.',
    }]);
  }
  const text = await readFile(specAbs, 'utf8');
  const manifest = await loadShippedManifest(projectRoot);
  const fences = collectShellFences(text);
  const findings = [
    ...runDevTreeAndUnshippedChecks(fences, manifest, specPath),
    ...runDevHelperExtensions(text, specPath, projectRoot),
  ];
  return {
    slug,
    spec_path: specPath,
    verdict: deriveVerdict(findings),
    generated_at: new Date().toISOString(),
    findings,
  };
}

async function loadShippedManifest(projectRoot) {
  const path = join(projectRoot, 'obj/template/.claude/manifest.json');
  if (!existsSync(path)) return { files: {} };
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return { files: {} };
  }
}

function emptyReport(slug, specPath, verdict, findings) {
  return {
    slug, spec_path: specPath, verdict,
    generated_at: new Date().toISOString(), findings,
  };
}

function deriveVerdict(findings) {
  if (findings.some((f) => f.severity === 'BLOCKER')) return 'BLOCKED';
  if (findings.length > 0) return 'NEEDS_REVIEW';
  return 'CLEAN';
}

function runDevHelperExtensions(text, specPath, projectRoot) {
  const findings = [];
  const seen = new Set();
  WRITE_SET_LINE_RE.lastIndex = 0;
  let m;
  while ((m = WRITE_SET_LINE_RE.exec(text)) !== null) {
    const path = stripLeadingDotSlash(m[1]);
    if (!path.startsWith('.claude/skills/')) continue;
    if (!path.endsWith('.py')) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    const existsOnDisk = existsSync(join(projectRoot, path));
    findings.push({
      severity: existsOnDisk ? 'ADVISORY' : 'BLOCKER',
      check: 'DEV_HELPER_EXTENSION',
      file: specPath,
      line: lineOf(text, m.index),
      evidence: trimEvidence(m[0]),
      message: existsOnDisk
        ? `Modification to grandfathered Python helper \`${path}\`. Existing .py helpers are accepted, but new Python is forbidden going forward.`
        : `New Python helper \`${path}\` in a shipped skill. New helpers under \`.claude/skills/<slug>/\` must be \`.sh\` or \`.mjs\`/\`.js\`.`,
      suggested_fix: existsOnDisk
        ? `Open a follow-up workflow to port \`${path}\` to JS (Node ESM, stdlib only). This change can proceed; the ADVISORY is for tracking.`
        : `Rewrite as \`${path.replace(/\.py$/, '.mjs')}\` using Node ESM with stdlib only.`,
    });
  }
  return findings;
}

function lineOf(text, charIdx) {
  return text.slice(0, charIdx).split('\n').length;
}

function stripLeadingDotSlash(p) {
  return p.startsWith('./') ? p.slice(2) : p;
}

function trimEvidence(s) {
  const collapsed = s.replace(/\s+/g, ' ').trim();
  return collapsed.length > 120 ? collapsed.slice(0, 117) + '...' : collapsed;
}

async function writeReport(projectRoot, slug, report) {
  const outPath = join(projectRoot, '.claude/state/spec-shippability', `${slug}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(report, null, 2) + '\n');
}

function printSummary(report) {
  const counts = report.findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, { BLOCKER: 0, ADVISORY: 0 });
  process.stdout.write(`# spec-shippability-review — ${report.slug}\n\n`);
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
