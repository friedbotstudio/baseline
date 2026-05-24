#!/usr/bin/env node
// spec-shippability-review — analyzer for the v0.8.1-class failure mode:
// shipped SKILL.md prose that references dev-only paths the consumer doesn't
// receive. See sibling SKILL.md for the failure mode + check semantics.
//
// Reads docs/specs/<slug>.md, extracts write_set + shell code fences + path
// mentions, runs C1/C2/C3 against the shipped manifest at
// obj/template/.claude/manifest.json, writes the punch list to
// .claude/state/spec-shippability/<slug>.json, prints a human-readable
// summary to stdout, exits 0 (CLEAN) / 1 (NEEDS_REVIEW) / 2 (BLOCKED).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

const DEV_ONLY_PREFIXES = ['src/', 'tests/', 'scripts/', 'obj/'];

// docs/ is dev-only except for the one path that DOES ship: docs/init/seed.md.
function isDevOnlyPath(path) {
  if (DEV_ONLY_PREFIXES.some((p) => path.startsWith(p))) return true;
  if (path.startsWith('docs/') && path !== 'docs/init/seed.md') return true;
  return false;
}

const SHELL_FENCE_RE = /^```(?:bash|sh|shell)\s*\n([\s\S]*?)\n```/gm;
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
  const findings = [
    ...checkDevTreeRuntimeRefs(text, specPath),
    ...checkDevHelperExtensions(text, specPath, projectRoot),
    ...checkUnshippedModuleImports(text, specPath, manifest),
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

// ----- C1 -----------------------------------------------------------------

const RUNTIME_INVOCATION_PATTERNS = [
  // node -e "import('./path/...')"  or  node -e "import('.claude/path/...')"
  // Accepts optional `./` prefix so both forms match. Path may start with `.`
  // (e.g., `.claude/...`) or a word char (e.g., `src/...`).
  { re: /(?:import|require)\s*\(\s*['"`](?:\.\/)?([.\w][\w./-]*)['"`]\s*\)/g, group: 1 },
  // node ./path/foo.mjs  /  node .claude/path/foo.mjs  /  bash scripts/foo.sh
  // Path must end with an extension so we don't match bare command names.
  { re: /\b(?:node|python3?|bash|sh)\s+(?:\.\/)?([.\w][\w./-]*\.\w+)\b/g, group: 1 },
  // ./scripts/something.sh — bare relative invocation with explicit `./`
  { re: /(?<![\w/])(\.\/(?:src|tests|scripts|obj|docs)\/[\w./-]+)(?:\s|$)/g, group: 1 },
];

function checkDevTreeRuntimeRefs(text, specPath) {
  const findings = [];
  const seen = new Set();
  const fences = collectShellFences(text);
  for (const fence of fences) {
    for (const { re, group } of RUNTIME_INVOCATION_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(fence.body)) !== null) {
        const refPath = stripLeadingDotSlash(m[group]);
        if (!isDevOnlyPath(refPath)) continue;
        const line = fence.startLine + countNewlines(fence.body.slice(0, m.index));
        const dedupKey = `${line}:${refPath}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        findings.push({
          severity: 'BLOCKER',
          check: 'DEV_TREE_RUNTIME_REF',
          file: specPath,
          line,
          evidence: trimEvidence(m[0]),
          message: `Runtime invocation references \`${refPath}\` — \`${devPrefix(refPath)}\` is dev-only; consumer installs do not receive this directory.`,
          suggested_fix: `Move the logic into a shipped helper under \`.claude/skills/<slug>/<helper>.mjs\`, OR inline the implementation into the \`node -e "..."\` command body.`,
        });
      }
    }
  }
  return findings;
}

function collectShellFences(text) {
  const out = [];
  let idx = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^```(bash|sh|shell)\s*$/);
    if (!m) continue;
    const body = [];
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith('```')) {
      body.push(lines[j]);
      j++;
    }
    out.push({ startLine: i + 2, body: body.join('\n') });
    i = j;
  }
  return out;
}

function stripLeadingDotSlash(p) {
  return p.startsWith('./') ? p.slice(2) : p;
}

function devPrefix(path) {
  for (const p of DEV_ONLY_PREFIXES) if (path.startsWith(p)) return p.slice(0, -1);
  if (path.startsWith('docs/')) return 'docs';
  return path.split('/')[0];
}

function countNewlines(s) { return (s.match(/\n/g) || []).length; }

function trimEvidence(s) {
  const collapsed = s.replace(/\s+/g, ' ').trim();
  return collapsed.length > 120 ? collapsed.slice(0, 117) + '...' : collapsed;
}

// ----- C2 -----------------------------------------------------------------

function checkDevHelperExtensions(text, specPath, projectRoot) {
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

// ----- C3 -----------------------------------------------------------------

function checkUnshippedModuleImports(text, specPath, manifest) {
  const shipped = new Set(Object.keys(manifest.files || {}));
  const findings = [];
  const seen = new Set();
  const fences = collectShellFences(text);
  for (const fence of fences) {
    for (const { re, group } of RUNTIME_INVOCATION_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(fence.body)) !== null) {
        const refPath = stripLeadingDotSlash(m[group]);
        if (!refPath.startsWith('.claude/')) continue;
        if (shipped.has(refPath)) continue;
        const key = refPath;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          severity: 'BLOCKER',
          check: 'UNSHIPPED_MODULE_IMPORT',
          file: specPath,
          line: fence.startLine + countNewlines(fence.body.slice(0, m.index)),
          evidence: trimEvidence(m[0]),
          message: `Runtime invocation references \`${refPath}\`, which is NOT in \`obj/template/.claude/manifest.json\`. Consumer installs won't have this file.`,
          suggested_fix: `Add the file to a baseline-owned skill directory (so \`scripts/build-template.sh\` picks it up via the recursive cp and \`scripts/build-manifest.mjs\` adds it to the manifest), OR change the invocation to reference a file that IS in the shipped manifest.`,
        });
      }
    }
  }
  return findings;
}

// ----- Output -------------------------------------------------------------

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
