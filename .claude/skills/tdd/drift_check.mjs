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
// `**ACs**:` label names its ids and the spec's top-level AC table is filtered
// by them. Not the other way round — a slice section carries no `| AC-004 |` rows,
// so scoping the table regex to the section would match zero and report clean.
// When that scoping fails, the report says so and the run counts one unresolved
// item; it never falls back to the spec's full AC list.
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

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, sep } from 'node:path';
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
//
// The remaining seven are the same defect, generalized rather than patched a
// fourth time: every directory here holds per-workflow REPORTS, and a report about
// a workflow is never the implementation of one. Live case — this ticket's drift
// tick resolved two ACs against `docs/audits/<a prior session's report>.md`, which
// only discussed the ids. Both had real coverage elsewhere, so the verdicts were
// right by accident; an AC with none would have passed identically.
//
// `docs/system/`, `docs/references/` and `docs/runbooks/` are deliberately NOT
// here. Those can be a docs ticket's actual deliverable, and excluding them would
// make such a ticket's ACs permanently unresolvable.
const EXCLUDED_DIFF_PREFIXES = [
  'docs/specs/',
  'docs/archive/',
  'docs/audits/',
  'docs/rca/',
  'docs/security/',
  'docs/intake/',
  'docs/scout/',
  'docs/research/',
  'docs/brief/',
  '.claude/state/',
];

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
// The narrowing runs on the TABLE's ids, filtered by the slice label's — a slice
// section has no table rows of its own, so matching AC_ROW_RE against the section
// text would yield an empty scan that reports clean.
//
// An empty scope used to fall through to the full list. That made a scoping failure
// indistinguishable from a slice owning every AC, and one child's tick scored its
// whole epic — 31 of 37 criteria unresolved, every one owned by an unbuilt slice.
// The two failures are named instead, and neither substitutes anything.
// An id the label claims and the table lacks is the same defect one branch deeper:
// filtering the table by it silently drops it, and when it is the ONLY id claimed
// the scan covers nothing and the gate goes green. Both are named instead.
function parseAcs(specText, sliceId) {
  const all = [];
  for (const m of specText.matchAll(AC_ROW_RE)) all.push(m[1]);
  if (!sliceId) return { acs: all, scoping: 'unscoped', unknown: [] };

  const section = sliceSection(specText, sliceId);
  if (section === null) return { acs: [], scoping: 'section-missing', unknown: [] };

  const claimed = sliceAcIds(section);
  if (claimed.length === 0) return { acs: [], scoping: 'acs-missing', unknown: [] };

  const acs = all.filter((id) => claimed.includes(id));
  const unknown = claimed.filter((id) => !all.includes(id));
  if (unknown.length === 0) return { acs, scoping: 'scoped', unknown };
  return { acs, scoping: acs.length === 0 ? 'acs-unknown' : 'acs-partial', unknown };
}

const SCOPING_FAILURE_REASON = {
  'section-missing': ({ sliceId }) => `no \`## Slice ${sliceId}\` heading resolves in the spec`,
  'acs-missing': ({ sliceId }) => `the \`## Slice ${sliceId}\` section carries no AC list`,
  'acs-unknown': ({ unknown }) => `the AC list names ${unknown.join(', ')}, and the spec's AC table has none of them`,
  'acs-partial': ({ unknown }) => `the AC list names ${unknown.join(', ')}, which the spec's AC table does not carry`,
};

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

// The Contracts table is h3 under `## Program design` in the template, but some
// specs promote it to h2. Both are accepted; the section ends at the next heading
// of either depth.
const CONTRACTS_SECTION_RE = /^#{2,3}\s+Contracts\s*\n([\s\S]*?)(?=^#{2,3}\s|$(?![\s\S]))/m;
const TABLE_ROW_RE = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm;
const BACKTICK_SPAN = /`([^`]+)`/g;

// `<slug>`, `[--strict]`, `{rootDir}` and a call's argument list are never in a
// diff, and an argument list is not part of a name. Stripping them before
// tokenizing is what keeps `restoreDegradedShards({rootDir})` from yielding
// `rootDir` as a token of its own.
const PLACEHOLDER_RE = /<[^>]*>|\[[^\]]*\]|\{[^}]*\}|\([^)]*\)/g;
const RUNNER_WORDS = new Set(['node', 'npx', 'bash', 'sh']);

// The Kind column is deliberately never read: ~150 free-text values across the
// live corpus, with one concept spelled six ways. There is no enum to key on.
export function contractTokens(nameCell) {
  const out = new Set();
  for (const span of String(nameCell).matchAll(BACKTICK_SPAN)) {
    for (const raw of span[1].replace(PLACEHOLDER_RE, ' ').split(/[\s,]+/)) {
      const word = raw.replace(/^[^A-Za-z0-9_.\-/]+|[^A-Za-z0-9_\-/]+$/g, '');
      if (!word || word.startsWith('--') || RUNNER_WORDS.has(word)) continue;
      if (word.length < 3 || !/[A-Za-z]/.test(word)) continue;
      out.add(word);
    }
  }
  return [...out];
}

// An invocation promises something RUNNABLE, which a token match cannot express:
// the module path of a library appears in the diff exactly as the path of a CLI
// does. `path` stays null for a bare bin name, which resolves through
// `package.json → bin` rather than a repo path and is therefore not probeable.
const INVOCATION_RE = /^(?:node|npx|bash|sh)\s+(\S+)|^(\S+\.(?:mjs|js|sh))\s+\S/;

function invocationOf(nameCell) {
  const first = String(nameCell).match(BACKTICK_SPAN)?.[0]?.slice(1, -1);
  if (!first) return null;
  const m = INVOCATION_RE.exec(first.trim());
  if (!m) return null;
  const target = m[1] ?? m[2];
  return { raw: first, path: /[/\\.]/.test(target) ? target : null };
}

export function extractContractRows(specText) {
  const section = CONTRACTS_SECTION_RE.exec(String(specText));
  if (!section) return [];
  const rows = [];
  for (const m of section[1].matchAll(TABLE_ROW_RE)) {
    const [, kind, name] = m;
    if (/^[\s:|\-]+$/.test(kind) || kind.toLowerCase() === 'kind') continue;
    rows.push({ name, tokens: contractTokens(name), invocation: invocationOf(name) });
  }
  return rows;
}

// A Contracts row is authored content, so its path is attacker-influenceable by
// whoever writes the spec. REJECT, never normalize: resolving a `../../..` would
// open a file outside the repo and report one bit about its contents.
// `resolve` is LEXICAL and does not follow links, so a lexical check alone passes
// a symlink whose PATH is inside the root while its target is not — CWE-59, the
// same defect and posture as `restore-degraded-shards.mjs → classifyEntry`.
// `realpathSync` resolves the whole chain, including a symlinked PARENT directory
// that a per-entry `lstat` would miss.
//
// Both sides are realpathed, matching `isRunAsScript` below: on macOS `/tmp` is
// itself a symlink to `/private/tmp`, so realpathing only the target makes every
// temp-dir root read as an escape.
function containedReal(root, target) {
  const real = realpathSync(target);
  return real === root || real.startsWith(root + sep);
}

export function probeRunnable(rootDir, relPath) {
  const root = realpathSync(resolve(rootDir));
  const target = resolve(root, relPath);
  if (target !== root && !target.startsWith(root + sep)) return 'refused';
  let contained;
  try {
    contained = containedReal(root, target);
  } catch {
    return 'absent';
  }
  if (!contained) return 'refused';
  let text;
  try {
    text = readFileSync(target, 'utf8');
  } catch {
    return existsSync(target) ? 'not-runnable' : 'absent';
  }
  const guarded = /import\.meta\.url\s*===|process\.argv\[1\]|require\.main\s*===\s*module/.test(text);
  // The `await` prefix is the one broadening with evidence behind it: 2 of 11
  // shipped skill CLIs open with `await dispatch({...})` and were scored
  // not-runnable while executing fine. The line anchor stays — it is what stops an
  // incidental `run(` deep in a file from reading as an entry point.
  const topLevel = /^(?:await\s+)?(?:dispatch|main|run)\s*\(/m.test(text);
  return guarded || topLevel ? 'runnable' : 'not-runnable';
}

// Every ambiguity resolves toward silence. drift_check gates every spec-track
// TDD phase, so a missed promise costs one review cycle while a false positive
// halts a workflow that did nothing wrong. `skipped` never reaches the exit code.
function scoreInvocation({ path }, rootDir) {
  if (path === null) return ['skipped', 'a bare bin name resolves outside the repo'];
  const state = probeRunnable(rootDir, path);
  if (state === 'refused') return ['skipped', `refused: ${path} escapes the project root`];
  if (state === 'absent') return ['unresolved', `promised entry point is missing: ${path}`];
  if (state === 'not-runnable') return ['unresolved', `${path} is present but not runnable as named`];
  return ['resolved', `${path} is runnable as named`];
}

function scoreTokens({ tokens }, diffAdded) {
  if (tokens.length === 0) return ['skipped', 'no machine-readable identifier in the Name cell'];
  for (const ln of diffAdded) {
    if (tokens.some((t) => ln.includes(t))) {
      const snippet = ln.trim();
      return ['resolved', `found in diff: ${snippet.length > 120 ? snippet.slice(0, 117) + '...' : snippet}`];
    }
  }
  return ['unresolved', 'no diff added-line references this contract'];
}

export function scoreContractRow(row, diffAdded, rootDir) {
  return row.invocation ? scoreInvocation(row.invocation, rootDir) : scoreTokens(row, diffAdded);
}

// The sweep scores the DIFF half only. The disk probe reads the tree as it is
// NOW, while an archived spec describes the tree as it was at its landing, so
// probing here would report a moved entry point as a broken promise. The probe's
// correctness is pinned by its own controls instead.
//
// An EPIC spec is excluded, and the count is returned rather than dropped
// silently. The `epic` track has no implementation phases: its commit carries the
// sliced spec and nothing else, and each slice's promises land later in its own
// `epic-child` commit. Scoring an epic against its own landing commit therefore
// measures the track's shape, not the resolver — it produced all 8 apparent
// offenders in the first live run, every one from `system-spec-delta`.
const SLICE_HEADING_RE = /^##\s+Slice\s+\S/m;

export function sweepArchivedSpecs(rootDir) {
  const archive = join(rootDir, 'docs', 'archive');
  if (!existsSync(archive)) return { skipped: 'no archive', rows: 0, unresolved: [] };
  const specs = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'spec.md') specs.push(path);
    }
  };
  walk(archive);

  let rows = 0;
  let epicsSkipped = 0;
  const unresolved = [];
  for (const specPath of specs) {
    const rel = specPath.slice(rootDir.length + 1);
    const specText = readFileSync(specPath, 'utf8');
    if (SLICE_HEADING_RE.test(specText)) {
      epicsSkipped += 1;
      continue;
    }
    const log = spawnSync('git', ['-C', rootDir, 'log', '--diff-filter=A', '--format=%H', '--', rel], { encoding: 'utf8' });
    const sha = (log.stdout ?? '').split('\n').filter(Boolean)[0];
    if (!sha) continue;
    const show = spawnSync('git', ['-C', rootDir, 'show', sha], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const added = addedLines(show.stdout ?? '');
    for (const row of extractContractRows(specText)) {
      if (row.invocation) continue;
      rows += 1;
      if (scoreContractRow(row, added, rootDir)[0] === 'unresolved') unresolved.push(`${rel} :: ${row.name}`);
    }
  }
  return { rows, epicsSkipped, unresolved };
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

// A scoping failure leads the section, because a reader who does not see it reads
// the AC rows as drift. The banner says it in prose and the first table row says it
// in a form a script can match.
function acSectionLines(rows, scoping, sliceId, unknown) {
  const reason = SCOPING_FAILURE_REASON[scoping];
  const lines = ['## Acceptance criteria', ''];
  const text = reason ? reason({ sliceId, unknown }) : '';
  if (reason) {
    lines.push(
      `**SCOPING FAILED** — slice \`${sliceId}\` pinned, but ${text}. The spec's full AC list was NOT substituted.`,
      '',
    );
  }
  lines.push('| kind | id | verdict | evidence |', '|---|---|---|---|');
  if (reason) lines.push(`| scoping | ${sliceId} | unresolved | ${scoping}: ${text} |`);
  for (const [acId, verdict, evidence] of rows) {
    lines.push(`| ac | ${acId} | ${verdict} | ${evidence} |`);
  }
  return lines;
}

function renderReport(slug, acSection, designRows, contractRows) {
  const lines = [
    `# Drift report — ${slug}`,
    '',
    `Generated at: ${nowIso()}`,
    '',
    ...acSectionLines(acSection.rows, acSection.scoping, acSection.sliceId, acSection.unknown),
  ];
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
  lines.push('## Contracts');
  lines.push('');
  if (contractRows.length === 0) {
    lines.push('no contracts table — skipped');
  } else {
    lines.push('| kind | name | verdict | evidence |');
    lines.push('|---|---|---|---|');
    for (const [name, verdict, evidence] of contractRows) {
      lines.push(`| contract | ${name} | ${verdict} | ${evidence} |`);
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
  const { acs, scoping, unknown } = parseAcs(specText, sliceId);
  const acResults = acs.map(acId => [acId, ...scoreAgainstDiff(acId, diffAdded)]);
  const designResults = parseDesignCalls(specText).map(s => [s, ...scoreAgainstDiff(s, diffAdded)]);

  const contractResults = extractContractRows(specText).map((row) => [row.name, ...scoreContractRow(row, diffAdded, projectRoot)]);

  const report = renderReport(values.slug, { rows: acResults, scoping, sliceId, unknown }, designResults, contractResults);
  writeReport(projectRoot, values.slug, report);

  // A scoping failure scores no AC, so without counting it the gate would go green
  // on the one input it understands least.
  const scopingUnresolved = SCOPING_FAILURE_REASON[scoping] ? 1 : 0;
  const unresolved = scopingUnresolved
    + [...acResults, ...designResults, ...contractResults].filter(([, v]) => v === 'unresolved').length;
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
