#!/usr/bin/env node
// Covers AC-002, AC-006 of remove-python-runtime-dep.
// Spec-to-implementation drift analysis (Phase 6 worker step).
//
// CLI:
//   node drift_check.mjs --slug <slug> [--project-root <path>] [--diff <path>]
//
// Resolves this workflow's spec via `pinned-spec.resolveSpecPath` — `docs/specs/
// <slug>.md` for a single-shot track, or the epic spec named by `workflow.json →
// pinned_artifacts.spec` for an `epic-child` — then scores every numbered AC in the
// ## Acceptance criteria table and every row of the ## Design calls table against
// the implementation diff (--diff override, else the WORKING-TREE diff: uncommitted
// changes via `git diff HEAD` plus untracked files via an intent-to-add
// equivalent). Working-tree sourcing is what makes drift-check meaningful during
// the pre-commit /tdd phase, where the workflow code is still uncommitted and
// committed history (e.g. `merge-base..HEAD`) is empty. Writes a markdown report at
// `<project-root>/.claude/state/drift/<slug>.md` with a per-item verdict of
// `resolved | unresolved | unknown` plus evidence.
//
// On an epic-child the scan is SCOPED to the pinned slice: the slice's
// `- **ACs**:` bullet names its ids and the spec's top-level AC table is filtered
// by them. Not the other way round — a slice section carries no `| AC-004 |` rows,
// so scoping the table regex to the section would match zero and report clean.
//
// Exit codes:
//   0  zero unresolved
//   1  >=1 unresolved
//   2  tool error
//
// Special case: NO spec anywhere — none at the slug and no pin that resolves →
// print "no spec; skipped" to stdout, exit 0, no report file written (supports
// chore-track workflows). This is deliberately narrower than it used to be: it
// once also swallowed every epic-child, whose spec exists but not at its slug, and
// three consecutive children shipped on that vacuous green.

import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { resolveSpecPath, sliceAcIds, sliceSection } from '../../hooks/lib/pinned-spec.mjs';

// Spec/archive prose is excluded from the scored diff (backlog a1b2). An AC id
// resolves only when it appears in an IMPLEMENTATION or TEST added-line — never
// in the spec markdown's own `| AC-NNN | ... |` rows. During the pre-commit
// /tdd phase the spec under review is uncommitted (untracked), so without this
// exclusion every AC self-satisfies against the spec document and drift-check
// becomes a trivial always-pass. `docs/archive/` is excluded for the same reason
// (archived specs from prior workflows carry the same AC-id rows).
// `.claude/state/` holds this checker's OWN report, whose every row contains an AC
// id verbatim. Without the exclusion a second run scores each id against the first
// run's output and the gate silently turns green — a checker that certifies itself.
// It never bit this repo only because `.claude/state/` is gitignored here; a
// consumer project without that ignore would see every AC resolve on re-run.
const EXCLUDED_DIFF_PREFIXES = ['docs/specs/', 'docs/archive/', '.claude/state/'];

function isExcludedDiffPath(relPath) {
  return EXCLUDED_DIFF_PREFIXES.some(prefix => relPath.startsWith(prefix));
}

const AC_ROW_RE = /^\|\s*(AC-\d+)\s*\|/gm;

// Extract the unique AC ids declared in a spec's AC table. Shared with the
// ac-conformance checker (C5) so the two read the same rows.
export function extractAcIds(specText) {
  const ids = [];
  for (const m of String(specText).matchAll(AC_ROW_RE)) ids.push(m[1]);
  return [...new Set(ids)];
}
const DESIGN_CALLS_SECTION_RE = /^##\s+Design calls\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m;
const DESIGN_ROW_RE = /^\|\s*([^|]+?)\s*\|/gm;
const NONE_BODY_RE = /^[\s\-]*\*?\(?none\)?\*?[\s\-]*$/i;

// Returns null ONLY when there is no spec anywhere. An epic-child's spec exists at
// the epic's slug, so this resolves the pin rather than reporting nothing.
function loadSpec(projectRoot, slug) {
  const { path, sliceId } = resolveSpecPath({ rootDir: projectRoot, slug });
  if (!path) return null;
  return { text: readFileSync(path, 'utf8'), sliceId };
}

function untrackedDiff(projectRoot) {
  const listed = spawnSync('git', ['-C', projectRoot, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (listed.status !== 0 || !listed.stdout.trim()) return '';
  const paths = listed.stdout.split('\n').map(p => p.trim()).filter(Boolean).filter(p => !isExcludedDiffPath(p));
  let out = '';
  for (const rel of paths) {
    // `--no-index` diffs an untracked file against /dev/null so its lines count
    // as added, without staging it (no index mutation). It exits 1 when the
    // files differ; the diff text is on stdout regardless of exit status.
    const d = spawnSync('git', ['-C', projectRoot, 'diff', '--no-index', '--', '/dev/null', rel], { encoding: 'utf8' });
    if (d.stdout) out += d.stdout;
  }
  return out;
}

function loadDiff(projectRoot, diffPath) {
  if (diffPath) {
    return readFileSync(diffPath, 'utf8');
  }
  // Exclude pathspecs keep spec/archive prose out of the tracked diff too (a
  // tracked spec edited in this workflow would otherwise self-satisfy its ACs).
  // The leading `.` positive pathspec is required so git does not reject an
  // all-exclusion pathspec list.
  const excludeSpecs = EXCLUDED_DIFF_PREFIXES.map(prefix => `:(exclude)${prefix}`);
  const tracked = spawnSync('git', ['-C', projectRoot, 'diff', 'HEAD', '--', '.', ...excludeSpecs], { encoding: 'utf8' });
  const trackedDiff = tracked.status === 0 ? tracked.stdout : '';
  return trackedDiff + untrackedDiff(projectRoot);
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

// The spec's top-level AC table, narrowed to the pinned slice when there is one.
// The narrowing runs on the TABLE's ids, filtered by the slice bullet's — a slice
// section has no table rows of its own, so matching AC_ROW_RE against the section
// text would yield an empty scan that reports clean.
function parseAcs(specText, sliceId) {
  const out = [];
  for (const m of specText.matchAll(AC_ROW_RE)) out.push(m[1]);
  const scoped = sliceAcIds(sliceSection(specText, sliceId));
  return scoped.length ? out.filter((id) => scoped.includes(id)) : out;
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

// A file-header comment naming a span — `(AC-004..AC-008)` — is the natural way to
// annotate a file covering a whole ticket, but a literal-substring match resolves
// only the two endpoints and reports every id BETWEEN them as unimplemented. That
// was 9 of 23 ACs on one real workflow, all of them genuinely tested. A drift
// signal wrong that often trains the reader to skip it.
const AC_SPAN_RE = /AC-(\d+)\s*\.\.\s*AC-(\d+)/g;
const AC_ID_RE = /^AC-(\d+)$/;

// A REVERSED span (`AC-008..AC-004`) is malformed, not a range: expanding it would
// resolve ids the author never claimed, turning a weak signal into a false one.
function spanCovers(line, number) {
  for (const [, lo, hi] of line.matchAll(AC_SPAN_RE)) {
    const low = Number(lo);
    const high = Number(hi);
    if (low <= high && number >= low && number <= high) return true;
  }
  return false;
}

function lineReferences(line, itemId) {
  if (line.includes(itemId)) return true;
  const asAc = AC_ID_RE.exec(itemId);
  return asAc ? spanCovers(line, Number(asAc[1])) : false;
}

function scoreAgainstDiff(itemId, diffAdded) {
  for (const ln of diffAdded) {
    if (lineReferences(ln, itemId)) {
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
  const spec = loadSpec(projectRoot, values.slug);
  if (spec === null) {
    process.stdout.write('no spec; skipped\n');
    return 0;
  }
  const { text: specText, sliceId } = spec;

  const diffPath = values.diff ? resolve(values.diff) : null;
  const diffText = loadDiff(projectRoot, diffPath);
  const diffAdded = addedLines(diffText);

  // Design calls stay unscoped: the section is top-level with no per-slice
  // attribution, so there is nothing to scope them by. On the sliced specs this
  // repo writes today the section is `*(none)*`, which parses to zero rows.
  const acResults = parseAcs(specText, sliceId).map(acId => [acId, ...scoreAgainstDiff(acId, diffAdded)]);
  const designResults = parseDesignCalls(specText).map(s => [s, ...scoreAgainstDiff(s, diffAdded)]);

  const report = renderReport(values.slug, acResults, designResults);
  writeReport(projectRoot, values.slug, report);

  const unresolved = [...acResults, ...designResults].filter(([, v]) => v === 'unresolved').length;
  return unresolved === 0 ? 0 : 1;
}

// Run the CLI only when executed as a script — importing extractAcIds (the
// ac-conformance checker, C5) must not fire main(). realpath both sides so a
// symlinked invocation path (macOS /tmp -> /private/tmp) still matches.
function isRunAsScript() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url).pathname);
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}
if (isRunAsScript()) process.exit(main(process.argv.slice(2)));
