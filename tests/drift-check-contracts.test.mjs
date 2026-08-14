// Contracts rows resolve at drift-check — AC-001..AC-009.
//
// A spec's `## Contracts` table is a set of promises and nothing read it.
// `spec-lint` runs five checks and none touches the table; `drift_check` scored
// AC ids only. So a spec could commit to a function or a CLI that never shipped
// and every machine gate stayed green.
//
// Two mechanisms, because measurement showed one was not enough. The diff scan
// catches a promised name that appears nowhere. It does NOT catch a name present
// in another capacity — the motivating row named a module path that a test file
// held as a string constant, so it resolved while the promised CLI did not exist.
// The disk probe closes that: an invocation-shaped row must also name something
// runnable.
//
// This file is scored by the very oracle it tests. It names AC-001..AC-009
// because it covers exactly those; naming an id it did not cover would make it
// that id's false witness.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DRIFT = join(REPO_ROOT, '.claude/skills/tdd/drift_check.mjs');
const ARCHIVE = join(REPO_ROOT, 'docs/archive');

const mod = await import(DRIFT);

// Namespace-import plus a per-name guard: a bare `import { missing }` yields
// undefined and the test dies with an opaque "x is not a function". This way
// each test fails on its own line naming the export it wanted.
function fn(name) {
  assert.equal(typeof mod[name], 'function', `expected drift_check.mjs to export \`${name}\``);
  return mod[name];
}

const mkroot = () => mkdtempSync(join(tmpdir(), 'driftc-'));

function writeModule(root, rel, body) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, 'utf8');
  return abs;
}

function rowFor(nameCell) {
  const [row] = fn('extractContractRows')(
    ['## Contracts', '', '| Kind | Name | Input |', '|---|---|---|', `| Function | ${nameCell} | x |`].join('\n'),
  );
  return row;
}

describe('a token in an added line resolves the row (AC-001)', () => {
  it('test_when_a_token_appears_in_an_added_line_then_the_row_resolves', () => {
    const row = rowFor('`restoreDegradedShards({rootDir, specDir, dryRun})`');
    const added = ['+export function restoreDegradedShards({ rootDir } = {}) {'];

    const [verdict, evidence] = fn('scoreContractRow')(row, added, REPO_ROOT);

    assert.equal(verdict, 'resolved');
    assert.match(evidence, /restoreDegradedShards/, 'the evidence must name the line it matched, or a reader cannot audit the verdict');
  });
});

describe('a token appearing nowhere leaves the row unresolved (AC-002)', () => {
  it('test_when_no_token_appears_in_the_diff_then_the_row_is_unresolved', () => {
    const row = rowFor('`aFunctionNobodyWrote(x)`');

    const [verdict] = fn('scoreContractRow')(row, ['+const unrelated = 1;'], REPO_ROOT);

    assert.equal(verdict, 'unresolved', 'this is the verdict that drives the exit status to 1');
  });
});

// The two failure reasons are deliberately separate cases. Both are unresolved,
// but an operator who cannot tell "you never wrote it" from "you wrote it as a
// library" has to go and look, which is the cost the evidence string exists to
// remove.
describe('an invocation row is probed on disk (AC-003, AC-004)', () => {
  it('test_when_the_target_is_present_but_library_shaped_then_it_is_unresolved', () => {
    const root = mkroot();
    writeModule(root, 'lib/thing.mjs', 'export function thing() { return 1; }\n');
    const row = rowFor('`node lib/thing.mjs --dry-run`');

    const [verdict, evidence] = fn('scoreContractRow')(row, ['+import { thing } from "./lib/thing.mjs";'], root);

    assert.equal(verdict, 'unresolved', 'the module exists, so the diff scan alone would have passed it — this is the motivating defect');
    assert.match(evidence, /runnable/i, 'the evidence must say present-but-not-runnable, not that the file is missing');
  });

  it('test_when_the_target_is_absent_from_disk_then_it_is_unresolved', () => {
    const root = mkroot();
    const row = rowFor('`node lib/never-written.mjs`');

    const [verdict, evidence] = fn('scoreContractRow')(row, ['+// lib/never-written.mjs is planned'], root);

    assert.equal(verdict, 'unresolved');
    assert.doesNotMatch(evidence, /not runnable|not-runnable/i, 'absent and not-runnable are different findings and must read differently');
  });

  it('test_when_the_target_declares_a_main_guard_then_the_probe_resolves', () => {
    const root = mkroot();
    writeModule(root, 'bin/tool.mjs', 'export function go() {}\nif (import.meta.url === process.argv[1]) go();\n');
    const row = rowFor('`node bin/tool.mjs <slug>`');

    const [verdict] = fn('scoreContractRow')(row, ['+// bin/tool.mjs landed'], root);

    assert.equal(verdict, 'resolved');
  });

  it('test_when_the_target_has_a_top_level_dispatch_call_then_the_probe_resolves', () => {
    const root = mkroot();
    writeModule(root, 'skills/x/cli.mjs', "import { dispatch } from '../lib/argv.mjs';\ndispatch({ name: 'x', subcommands: {} });\n");
    const row = rowFor('`node skills/x/cli.mjs describe`');

    const [verdict] = fn('scoreContractRow')(row, ['+// skills/x/cli.mjs landed'], root);

    assert.equal(verdict, 'resolved', 'a top-level dispatch call is the second runnable shape; testing only the main guard ships the detector half-covered');
  });
});

describe('an uncheckable row is skipped, never unresolved (AC-005)', () => {
  it('test_when_the_name_cell_has_no_backtick_then_the_row_is_skipped', () => {
    const row = rowFor('the last non-flag operand (destination)');

    const [verdict] = fn('scoreContractRow')(row, ['+something'], REPO_ROOT);

    assert.equal(verdict, 'skipped', 'prose promises nothing machine-checkable; reporting it unresolved would halt a workflow that did nothing wrong');
  });

  it('test_when_a_span_is_only_a_placeholder_then_the_row_is_skipped', () => {
    const row = rowFor('`<target>`');

    assert.deepEqual(fn('contractTokens')('`<target>`'), [], 'stripping must not leave an empty-string token — that would match every line in the diff');
    assert.equal(fn('scoreContractRow')(row, ['+anything at all'], REPO_ROOT)[0], 'skipped');
  });

  it('test_when_the_target_is_a_bare_bin_name_then_it_is_skipped_not_probed', () => {
    const root = mkroot();
    const row = rowFor('`npx create-baseline <target> --force`');

    const [verdict] = fn('scoreContractRow')(row, ['+unrelated line'], root);

    assert.equal(verdict, 'skipped', 'a bin resolves through package.json bin, not a repo path, so there is nothing on disk to probe');
  });
});

// The target OUTSIDE the root is deliberately runnable. If the probe opened it
// the verdict would be `resolved`; asserting `refused` therefore proves the
// guard fired, rather than proving the file happened to be unreadable.
describe('a target escaping the root is refused (AC-009)', () => {
  it('test_when_the_target_escapes_the_repo_root_then_the_probe_refuses', () => {
    const outer = mkroot();
    writeModule(outer, 'outside.mjs', 'if (import.meta.url === process.argv[1]) {}\n');
    const root = join(outer, 'inner');
    mkdirSync(root, { recursive: true });

    assert.equal(fn('probeRunnable')(root, '../outside.mjs'), 'refused', 'REJECT, never normalize — resolving the path would open a file outside the repo');

    const row = rowFor('`node ../outside.mjs`');
    assert.notEqual(fn('scoreContractRow')(row, ['+x'], root)[0], 'unresolved', 'a malformed row is an authoring error, not a broken promise, so it must not gate');
  });

  // resolve() is LEXICAL and does not follow links, so a symlink whose path sits
  // inside the root passes a containment check that only compares strings — and
  // readFileSync then follows it out. Security review 2026-08-13, CWE-59; the same
  // defect and the same fix as `restore-degraded-shards.mjs → classifyEntry`.
  //
  // Both link targets are deliberately RUNNABLE. If the guard fails, the verdict
  // is `runnable`, so asserting `refused` proves the file was never opened rather
  // than proving it was unreachable.
  it('test_when_the_target_is_a_symlink_out_of_the_root_then_the_probe_refuses', () => {
    const outer = mkroot();
    writeModule(outer, 'outside/secret.mjs', 'if (import.meta.url === process.argv[1]) {}\n');
    const root = join(outer, 'root');
    mkdirSync(join(root, 'sub'), { recursive: true });
    symlinkSync(join(outer, 'outside', 'secret.mjs'), join(root, 'link.mjs'));
    symlinkSync(join(outer, 'outside'), join(root, 'linkdir'));

    assert.equal(fn('probeRunnable')(root, 'link.mjs'), 'refused', 'a symlinked FILE inside the root still points outside it');
    assert.equal(fn('probeRunnable')(root, 'linkdir/secret.mjs'), 'refused', 'a symlinked DIRECTORY is the same escape one level up, and a lexical check cannot see either');
  });
});

describe('the Kind column is never read (regression, D2)', () => {
  it('test_when_the_kind_column_carries_a_nonsense_value_then_nothing_changes', () => {
    const table = (kind) => ['## Contracts', '', '| Kind | Name | Input |', '|---|---|---|', `| ${kind} | \`sharedName(x)\` | x |`].join('\n');

    const sane = fn('extractContractRows')(table('Function'));
    const nonsense = fn('extractContractRows')(table('GA4 event (auto)'));

    assert.deepEqual(nonsense, sane, 'about 150 free-text Kind values exist live; a resolver reading that column would be aimed at an axis with no schema');
  });
});

// End-to-end through the CLI, matching tests/drift-check-working-tree-diff.test.mjs.
describe('the run and the report (AC-006, AC-007)', () => {
  function initRepo() {
    const root = mkdtempSync(join(tmpdir(), 'driftcx-'));
    spawnSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { encoding: 'utf8' });
    spawnSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'seed', '--no-gpg-sign'], { encoding: 'utf8' });
    return root;
  }

  function writeSpec(root, body) {
    const dir = join(root, 'docs', 'specs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'x.md'), body, 'utf8');
  }

  const AC_TABLE = ['## Acceptance criteria', '', '| ID | Criterion |', '|---|---|', '| AC-001 | a thing |', ''].join('\n');

  function run(root) {
    const res = spawnSync('node', [DRIFT, '--slug', 'x', '--project-root', root], { encoding: 'utf8' });
    return { status: res.status, out: (res.stdout ?? '') + (res.stderr ?? '') };
  }

  const report = (root) => readFileSync(join(root, '.claude', 'state', 'drift', 'x.md'), 'utf8');

  it('test_when_the_spec_has_no_contracts_section_then_the_run_exits_zero', () => {
    const root = initRepo();
    writeSpec(root, AC_TABLE);
    writeFileSync(join(root, 'impl.mjs'), '// covers AC-001\n', 'utf8');

    assert.equal(run(root).status, 0, 'a spec that promises nothing must not fail for promising nothing');
  });

  it('test_when_there_is_no_spec_at_all_then_the_run_exits_zero', () => {
    const root = initRepo();

    const res = run(root);

    assert.equal(res.status, 0);
    assert.match(res.out, /no spec/i, 'the pre-existing chore-track behaviour must be preserved verbatim');
  });

  it('test_when_the_report_is_written_then_it_carries_a_contracts_table', () => {
    const root = initRepo();
    writeSpec(root, [AC_TABLE, '## Contracts', '', '| Kind | Name | Input |', '|---|---|---|', '| Function | `landedThing(x)` | x |', ''].join('\n'));
    writeFileSync(join(root, 'impl.mjs'), '// covers AC-001\nexport function landedThing(x) { return x; }\n', 'utf8');

    run(root);

    assert.match(report(root), /^##\s+Contracts\s*$/m, 'the report needs its own Contracts section or the verdicts are invisible');
    assert.match(report(root), /landedThing/, 'each row is named with its verdict');
  });

  it('test_when_the_report_is_written_then_the_existing_tables_keep_their_shape', () => {
    const root = initRepo();
    writeSpec(root, [AC_TABLE, '## Contracts', '', '| Kind | Name | Input |', '|---|---|---|', '| Function | `landedThing(x)` | x |', ''].join('\n'));
    writeFileSync(join(root, 'impl.mjs'), '// covers AC-001\nexport function landedThing(x) { return x; }\n', 'utf8');

    run(root);
    const text = report(root);

    assert.match(text, /^##\s+Acceptance criteria\s*$/m, 'the existing AC section must survive');
    assert.match(text, /\|\s*kind\s*\|\s*id\s*\|\s*verdict\s*\|\s*evidence\s*\|/i, 'the AC table header is a shape other readers depend on');
    assert.match(text, /^##\s+Design calls\s*$/m, 'the Design calls section must survive');
  });
});

// The sweep asserts the RELATION — zero false unresolved — and never a row
// count. docs/archive/ grows by one spec every workflow, so a pinned number is
// a literal that drifts on a schedule.
// Hoisted from the AC-008 block when AC-010 became its second consumer. Pure
// relocation — no assertion changed.
const archived = () => (existsSync(ARCHIVE) ? readdirSync(ARCHIVE, { recursive: true }).filter((p) => String(p).endsWith('spec.md')) : []);

describe('no archived spec reports a false unresolved (AC-008)', () => {
  it('test_when_no_archive_is_present_then_the_sweep_skips_with_a_named_reason', () => {
    const root = mkroot();

    assert.deepEqual(fn('sweepArchivedSpecs')(root), { skipped: 'no archive', rows: 0, unresolved: [] }, 'a fresh or consumer tree carries no archive; the sweep must say so rather than fail');
  });

  it('test_when_every_archived_spec_is_scored_against_its_landing_commit_then_none_reports_unresolved', () => {
    const specs = archived();
    assert.ok(specs.length > 0, 'this repo carries archived specs; an empty list means the sweep is reading the wrong path and every assertion below is vacuous');

    const result = fn('sweepArchivedSpecs')(REPO_ROOT);

    // Added line: without it, a change that made the sweep return zero rows would
    // leave `unresolved: []` true and this whole assertion vacuous.
    assert.ok(result.rows > 0, 'the sweep must actually score rows; an empty scan satisfies the emptiness assertion below for the wrong reason');
    assert.deepEqual(
      result.unresolved,
      [],
      `every archived spec landed complete, so a non-empty list here is a FALSE POSITIVE in the resolver — the failure mode this design is weighted against. Offenders: ${JSON.stringify(result.unresolved)}`,
    );
  });
});

// The sweep dropped 5 of the archived specs on its first run. `epicsSkipped` makes
// that visible in the data, but visibility is not enforcement: a bug widening the
// slice-heading match would quietly cover less every run and stay green. That is
// the silent-cap shape this repo has a standing rule against.
//
// The expected count is DERIVED from the live corpus, never written as a literal.
// A number here would drift the moment the next epic lands, and this cycle has
// already produced three literal-drift corrections.
describe('the epic exclusion is counted, not silent (AC-010)', () => {
  it('test_when_the_sweep_excludes_epics_then_the_count_matches_the_live_sliced_specs', () => {
    const sliced = archived().filter((p) => /^##\s+Slice\s+\S/m.test(readFileSync(join(ARCHIVE, String(p)), 'utf8')));
    assert.ok(sliced.length > 0, 'this repo has archived at least one epic; zero means the scan is wrong and the equality below would hold trivially');

    const result = fn('sweepArchivedSpecs')(REPO_ROOT);

    assert.equal(
      result.epicsSkipped,
      sliced.length,
      `the sweep must exclude exactly the sliced specs and say how many. An epic's own commit carries discovery only — its Contracts land in its children's commits — so scoring it measures the track's shape, not the resolver. Sliced on disk: ${sliced.length}`,
    );
  });
});

// AC-006 — probeRunnable accepts an awaited dispatch entry point.
//
// The line anchor `/^(?:dispatch|main|run)\s*\(/m` reads `await dispatch({...})`
// as not-runnable, so a working CLI front door scored `unresolved` against a
// spec's Contracts row. Measured 2026-08-13: 2 of 11 shipped cli.mjs files failed
// (standup, spec), both confirmed runnable by execution. The suite stayed green
// because the fixture at line 117 writes `dispatch({...})` WITHOUT the await —
// a fixture that avoids the one shape the field uses.
describe('probeRunnable — awaited entry points (AC-006)', () => {
  it('test_when_shipped_cli_probed_then_every_front_door_is_runnable', () => {
    const skillsDir = join(REPO_ROOT, '.claude/skills');
    const clis = readdirSync(skillsDir)
      .map((slug) => join('.claude/skills', slug, 'cli.mjs'))
      .filter((rel) => existsSync(join(REPO_ROOT, rel)));

    assert.ok(clis.length > 0, 'the repo must ship at least one skill CLI for this to measure');

    const notRunnable = clis.filter((rel) => mod.probeRunnable(REPO_ROOT, rel) !== 'runnable');

    assert.deepEqual(notRunnable, [],
      'every shipped skill CLI is a real front door and must probe runnable. A live ' +
      'oracle over the real directory, not a fixture — a fixture-only test leaves the ' +
      'same hole one entry-point shape over, which is exactly how this shipped.');
  });

  it('test_when_entry_point_is_awaited_dispatch_then_probe_reports_runnable', () => {
    const root = mkroot();
    writeFileSync(join(root, 'front-door.mjs'), 'import { dispatch } from "./x.mjs";\nawait dispatch({\n  commands: {},\n});\n');

    assert.equal(mod.probeRunnable(root, 'front-door.mjs'), 'runnable',
      'this is the exact shape standup/cli.mjs:21 and spec/cli.mjs:84 use');
  });

  it('test_when_entry_point_is_indented_run_then_probe_reports_not_runnable', () => {
    const root = mkroot();
    writeFileSync(join(root, 'library.mjs'), 'export function f() {\n  run(x);\n}\n');

    assert.equal(mod.probeRunnable(root, 'library.mjs'), 'not-runnable',
      'the line anchor is deliberate — it stops an incidental run( deep in a file ' +
      'reading as an entry point, and the await broadening must not cost that');
  });
});
