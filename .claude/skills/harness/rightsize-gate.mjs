// Foundation: the post-tdd right-size gate (velocity Lever 2). Measures the real
// working-tree diff and decides which downstream phases a *micro* diff may skip.
// Mechanical by construction — the skip set is a pure function of file/line counts
// and glob set-intersection, never LLM judgment. Bounded: the skip allowlist is a
// hard subset of {simplify, document}; `security` is NEVER auto-skipped (a human
// decision, default runs). Fail-open: any error / disabled config yields an empty
// skip and empty advisories, so a malfunction degrades to today's full pipeline.
//
// The consuming side (harness loop applying skip[] to workflow.json exceptions +
// auto_skipped[], surfacing advisories[]) is documented in harness/SKILL.md and
// goes live the next spec-track workflow; this module is the mechanical oracle.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesAnyGlob as sharedMatchesAnyGlob } from '../../hooks/lib/glob-match.mjs';

const CANDIDATE_PHASES = ['simplify', 'security', 'document'];
const DEFAULT_DOC_GLOBS = ['docs/**', '**/*.md', 'src/cli/**', 'bin/**'];

// The micro-diff window. Measured against the last 120 commits of this repo, the
// original 4-file / 80-line window admitted 23 diffs while the gate may skip only
// `simplify` (median 1.8 min) and `document` (median 3.0 min) — about a minute a
// run. 8 / 200 admits 35 of the same 120 and stays well inside the envelope
// seed.md fixes for this gate: the skip set is unchanged, `security` is still
// never auto-skipped, and the gate is still fail-open.
const DEFAULT_MIN_FILES = 8;
const DEFAULT_MAX_LINES = 200;

// `segmentGlobstar` is this caller's dialect and the only one that asks for it:
// `**/` matches zero or more leading path segments, so `**/*.md` matches a
// top-level README.md. The default leaves `**/` as `.*/`, which requires one.
export function matchesAnyGlob(p, globs) {
  return sharedMatchesAnyGlob(p, globs || [], { segmentGlobstar: true });
}

export function parseNumstat(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [a, d, ...rest] = parts;
    const added = a === '-' ? 0 : parseInt(a, 10) || 0;
    const deleted = d === '-' ? 0 : parseInt(d, 10) || 0;
    rows.push({ added, deleted, path: rest.join('\t').trim() });
  }
  return rows;
}

export function measureDiff(rows) {
  return {
    files: rows.length,
    lines: rows.reduce((sum, r) => sum + r.added + r.deleted, 0),
    touched: rows.map((r) => r.path),
  };
}

function pathsMatching(touched, globs) {
  return touched.filter((p) => matchesAnyGlob(p, globs));
}

// D1 + D2: a measured row survives only when it is neither a test/fixture file
// (test lines gauge no change risk) nor a path that was already dirty when the
// workflow began (pre-existing cruft the workflow did not produce). Empty
// testGlobs AND empty basePaths => identity, preserving the whole-tree measure.
export function filterRows(rows, { testGlobs = [], basePaths = [] } = {}) {
  const excluded = new Set(basePaths.map(normaliseDiffPath));
  return rows.filter((r) => {
    const path = normaliseDiffPath(r.path);
    return !excluded.has(path) && !matchesAnyGlob(path, testGlobs);
  });
}

// The base snapshot stores plain repo-relative paths; the diff renders an
// untracked add as `/dev/null => <path>` and a rename as `<old> => <new>`. Both
// sides go through here so the comparison is one vocabulary rather than two —
// comparing them raw excluded every tracked base path and no untracked one.
export function normaliseDiffPath(path) {
  const arrow = String(path).lastIndexOf(' => ');
  return arrow === -1 ? String(path) : String(path).slice(arrow + 4);
}

// D2: the workflow's own diff is separated from pre-existing dirt by a start-of-
// workflow snapshot of the dirty/untracked path set. `git status --porcelain`
// lines are `XY <path>`; a rename renders as `old -> new` — the new path is the
// one now on disk.
export function parsePorcelain(text) {
  const paths = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let p = line.slice(3).trim();
    if (p.includes(' -> ')) p = p.split(' -> ').pop().trim();
    if (p) paths.push(p);
  }
  return paths;
}

export function captureBaseline({ rootDir, exec }) {
  try {
    return parsePorcelain(exec('git', ['-C', rootDir, 'status', '--porcelain']));
  } catch {
    return [];
  }
}

// Idempotent: a workflow already carrying rightsize_base (a resume) is returned
// untouched, so the baseline is fixed at the workflow's first arm.
export function applyBaseline(workflow, paths) {
  if (Array.isArray(workflow?.rightsize_base)) return workflow;
  return { ...workflow, rightsize_base: paths };
}

export function decideSkip({ measure, config, securityRunning }) {
  if (!config.enabled) {
    return { skip: [], keep: [...CANDIDATE_PHASES], advisories: [] };
  }

  const micro = measure.files < config.min_files && measure.lines <= config.max_lines;
  const skip = [];
  if (micro) {
    skip.push('simplify');
    if (pathsMatching(measure.touched, config.doc_globs).length === 0) skip.push('document');
  }

  const advisories = [];
  if (!securityRunning) {
    const sensitive = pathsMatching(measure.touched, config.sensitive_globs);
    if (sensitive.length > 0) {
      advisories.push({
        kind: 'sensitive_surface_unreviewed',
        paths: sensitive,
        message: 'security skipped but sensitive paths changed; run /security',
      });
    }
  }

  const keep = CANDIDATE_PHASES.filter((p) => !skip.includes(p));
  return { skip, keep, advisories };
}

export function configFromProject(project) {
  return {
    enabled: project?.velocity?.rightsize?.enabled ?? true,
    // Deliberately NOT defaulted from `simplify.min_files`. The two thresholds
    // answer opposite questions — `simplify.min_files` decides whether a diff is
    // big enough to deserve a cleanup pass, this one decides whether a diff is
    // small enough for that pass to be skipped outright. Reading one as the
    // other's default silently pinned the gate to whatever a project had tuned
    // simplify to, which is why this repo's gate sat at 4 files.
    min_files: project?.velocity?.rightsize?.min_files ?? DEFAULT_MIN_FILES,
    max_lines: project?.velocity?.rightsize?.max_lines ?? DEFAULT_MAX_LINES,
    doc_globs: project?.velocity?.rightsize?.doc_globs ?? DEFAULT_DOC_GLOBS,
    sensitive_globs: project?.security?.sensitive_globs ?? [],
    test_globs: project?.tdd?.test_globs ?? [],
  };
}

function collectMeasure(rootDir, exec, { testGlobs = [], basePaths = [] } = {}) {
  const tracked = exec('git', ['-C', rootDir, 'diff', 'HEAD', '--numstat']);
  let combined = tracked;
  const listed = exec('git', ['-C', rootDir, 'ls-files', '--others', '--exclude-standard']);
  for (const rel of listed.split('\n').map((s) => s.trim()).filter(Boolean)) {
    // --no-index numstat counts an untracked file's lines as added without staging.
    // It exits non-zero when files differ; the numstat is on stdout regardless, so
    // the injected exec must tolerate that (execFileSync throws — caught below).
    let d = '';
    try {
      d = exec('git', ['-C', rootDir, 'diff', '--no-index', '--numstat', '--', '/dev/null', rel]);
    } catch (e) {
      d = e.stdout ? String(e.stdout) : '';
    }
    if (d) combined += (combined.endsWith('\n') || !combined ? '' : '\n') + d;
  }
  const rows = filterRows(parseNumstat(combined), { testGlobs, basePaths });
  return measureDiff(rows);
}

// The fail-open decision, as DATA. Named once because three call sites need the
// same value and one of them (runRightsize) must not print it.
function failOpenDecision() {
  return { skip: [], keep: [...CANDIDATE_PHASES], advisories: [] };
}

// The data-returning entry a dispatcher verb can delegate to.
//
// `main` below already existed and is exported, but it WRITES its JSON to
// process.stdout and returns an exit code — so a `cli.mjs` verb calling it would
// put the helper's document and the dispatcher's document on stdout together and
// break the "--json emits JSON only" contract. Exporting something named `main` is
// not the same as exposing a callable entry; this is that entry.
//
// The fail-open posture is preserved exactly: any throw yields the empty decision
// rather than propagating, because a gate that errors must never be read as
// permission to skip a phase.
export async function runRightsize({ sub, rootDir = process.cwd(), deps = {} } = {}) {
  try {
    const exec = deps.exec || ((cmd, args) =>
      execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

    if (sub === 'baseline') {
      const workflow = readWorkflow(rootDir, deps);
      const applied = applyBaseline(workflow, captureBaseline({ rootDir, exec }));
      const changed = applied !== workflow;
      if (changed && !deps.workflow) {
        writeFileSync(workflowPath(rootDir), JSON.stringify(applied, null, 2) + '\n');
      }
      return { baseline: { applied: changed, paths: applied.rightsize_base ?? [] } };
    }

    if (sub !== 'check') return failOpenDecision();

    const config = configFromProject(deps.project ?? readProject(rootDir));
    const securityRunning = !((deps.workflow?.exceptions) || []).includes('security');
    const basePaths = readWorkflow(rootDir, deps).rightsize_base ?? [];

    const measure = collectMeasure(rootDir, exec, { testGlobs: config.test_globs, basePaths });
    return { ...decideSkip({ measure, config, securityRunning }), measured: measure };
  } catch {
    return failOpenDecision();
  }
}

// The CLI entry. Unchanged in behavior: `baseline` prints nothing, `check` prints
// the decision, anything else prints the fail-open decision, and every path exits
// 0. It now renders what `runRightsize` computes instead of computing inline.
export async function main(argv, deps = {}) {
  const [sub] = argv;
  const rootDir = deps.rootDir || process.cwd();
  const result = await runRightsize({ sub, rootDir, deps });

  if (sub === 'baseline') return 0;
  process.stdout.write(JSON.stringify(result) + '\n');
  return 0;
}

function workflowPath(rootDir) {
  return path.join(rootDir, '.claude', 'state', 'workflow.json');
}

// The CLI `check` run injects no project; the real config (test_globs, thresholds,
// doc/sensitive globs) lives on disk. Absent/unreadable => {} => configFromProject
// defaults, preserving fail-open behavior.
function readProject(rootDir) {
  try {
    return JSON.parse(readFileSync(path.join(rootDir, '.claude', 'project.json'), 'utf8'));
  } catch {
    return {};
  }
}

// The injected workflow (tests) short-circuits the disk read.
function readWorkflow(rootDir, deps) {
  if (deps.workflow) return deps.workflow;
  try {
    return JSON.parse(readFileSync(workflowPath(rootDir), 'utf8'));
  } catch {
    return {};
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
