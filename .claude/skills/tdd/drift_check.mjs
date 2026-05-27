#!/usr/bin/env node
// Covers AC-002, AC-006 of remove-python-runtime-dep.
// Spec-to-implementation drift analysis (Phase 6 worker step).
//
// CLI:
//   node drift_check.mjs --slug <slug> [--project-root <path>] [--diff <path>]
//
// Reads `docs/specs/<slug>.md` from `--project-root`, scores every numbered AC
// in the ## Acceptance criteria table and every row of the ## Design calls
// table against the implementation diff (--diff override, else `git diff
// <merge-base>..HEAD` against the main branch). Writes a markdown report at
// `<project-root>/.claude/state/drift/<slug>.md` with a per-item verdict of
// `resolved | unresolved | unknown` plus evidence.
//
// Exit codes:
//   0  zero unresolved
//   1  >=1 unresolved
//   2  tool error
//
// Special case: spec file missing at the named slug → print "no spec; skipped"
// to stdout, exit 0, no report file written (supports chore-track workflows).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const AC_ROW_RE = /^\|\s*(AC-\d+)\s*\|/gm;
const DESIGN_CALLS_SECTION_RE = /^##\s+Design calls\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m;
const DESIGN_ROW_RE = /^\|\s*([^|]+?)\s*\|/gm;
const NONE_BODY_RE = /^[\s\-]*\*?\(?none\)?\*?[\s\-]*$/i;

function loadSpec(projectRoot, slug) {
  const specPath = join(projectRoot, 'docs', 'specs', `${slug}.md`);
  if (!existsSync(specPath)) return null;
  return readFileSync(specPath, 'utf8');
}

function loadDiff(projectRoot, diffPath) {
  if (diffPath) {
    return readFileSync(diffPath, 'utf8');
  }
  const mb = spawnSync('git', ['-C', projectRoot, 'merge-base', 'HEAD', 'main'], { encoding: 'utf8' });
  if (mb.status !== 0) return '';
  const mergeBase = mb.stdout.trim();
  const diff = spawnSync('git', ['-C', projectRoot, 'diff', `${mergeBase}..HEAD`], { encoding: 'utf8' });
  return diff.status === 0 ? diff.stdout : '';
}

function writeReport(projectRoot, slug, body) {
  const outDir = join(projectRoot, '.claude', 'state', 'drift');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${slug}.md`);
  writeFileSync(outPath, body, 'utf8');
  return outPath;
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function addedLines(diffText) {
  return diffText.split('\n').filter(ln => ln.startsWith('+') && !ln.startsWith('+++'));
}

function parseAcs(specText) {
  const out = [];
  for (const m of specText.matchAll(AC_ROW_RE)) out.push(m[1]);
  return out;
}

function parseDesignCalls(specText) {
  const m = specText.match(DESIGN_CALLS_SECTION_RE);
  if (!m) return [];
  const body = m[1].trim();
  if (NONE_BODY_RE.test(body) || body.includes('*(none)*') || body.toLowerCase().includes('(none)')) {
    return [];
  }
  const rows = [];
  for (const rowMatch of body.matchAll(DESIGN_ROW_RE)) {
    const firstCell = rowMatch[1].trim();
    if (/^[\s:|\-]+$/.test(firstCell)) continue;
    if (firstCell.toLowerCase() === 'slug' || firstCell.toLowerCase() === 'kind') continue;
    rows.push(firstCell);
  }
  return rows;
}

function scoreAgainstDiff(itemId, diffAdded) {
  for (const ln of diffAdded) {
    if (ln.includes(itemId)) {
      let snippet = ln.trim();
      if (snippet.length > 120) snippet = snippet.slice(0, 117) + '...';
      return ['resolved', `found in diff: ${snippet}`];
    }
  }
  return ['unresolved', 'no diff added-line references this item'];
}

function renderReport(slug, acs, designRows) {
  const lines = [
    `# Drift report — ${slug}`,
    '',
    `Generated at: ${nowIso()}`,
    '',
    '## Acceptance criteria',
    '',
    '| kind | id | verdict | evidence |',
    '|---|---|---|---|',
  ];
  for (const [acId, verdict, evidence] of acs) {
    lines.push(`| ac | ${acId} | ${verdict} | ${evidence} |`);
  }
  lines.push('');
  lines.push('## Design calls');
  lines.push('');
  if (designRows.length === 0) {
    lines.push('no design calls — skipped');
  } else {
    lines.push('| kind | id | verdict | evidence |');
    lines.push('|---|---|---|---|');
    for (const [rowSlug, verdict, evidence] of designRows) {
      lines.push(`| design-call | ${rowSlug} | ${verdict} | ${evidence} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      slug: { type: 'string' },
      'project-root': { type: 'string', default: '.' },
      diff: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });

  if (!values.slug) {
    process.stderr.write('drift_check: --slug is required\n');
    return 2;
  }

  const projectRoot = resolve(values['project-root']);
  const specText = loadSpec(projectRoot, values.slug);
  if (specText === null) {
    process.stdout.write('no spec; skipped\n');
    return 0;
  }

  const diffPath = values.diff ? resolve(values.diff) : null;
  const diffText = loadDiff(projectRoot, diffPath);
  const diffAdded = addedLines(diffText);

  const acResults = parseAcs(specText).map(acId => [acId, ...scoreAgainstDiff(acId, diffAdded)]);
  const designResults = parseDesignCalls(specText).map(s => [s, ...scoreAgainstDiff(s, diffAdded)]);

  const report = renderReport(values.slug, acResults, designResults);
  writeReport(projectRoot, values.slug, report);

  const unresolved = [...acResults, ...designResults].filter(([, v]) => v === 'unresolved').length;
  return unresolved === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
