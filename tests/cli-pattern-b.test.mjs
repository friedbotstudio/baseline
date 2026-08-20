// Dispatcher sweep — Pattern B, the self-dispatching module (AC-014, AC-015).
//
// D1 sanctions two front-door patterns and picks by module shape. Pattern B is the
// larger in-repo precedent: 40 skill helpers already carry their own process.argv
// entry point against 4 using the shared dispatcher, including every harness/
// helper but workflow-migrator.js. Five join them here.
//
// The sixth candidate, workflow-migrator.js, could NOT: it is a byte-for-byte build
// mirror of src/cli/workflow-migrator.js, and an entry point written into a mirror
// is reverted by the next build. It got a Pattern A dispatcher instead — see the
// last describe block, and the D2 correction in lib/argv.mjs.
//
// The load-bearing assertion is the SECOND one, not the first. A module that runs
// its subcommand when invoked is easy; a module that stays inert when IMPORTED is
// the whole point of the main-guard, and getting it wrong means every hook and SOP
// that imports the module suddenly executes it. That cannot be caught by a
// try/catch in the parent — a module calling process.exit() on load takes the test
// runner down with it — so it runs in a child process that prints a sentinel after
// the import and is judged on whether the sentinel appears.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { PATTERN_B, patternBPath, runCli, assertPresent } from './helpers/cli-runner.mjs';

const mkdtemp = () => mkdtempSync(join(tmpdir(), 'patternb-'));

describe('Pattern B — invoked as a command', () => {
  // AC-014
  it('test_when_pattern_b_module_invoked_as_command_then_its_subcommand_runs', () => {
    const failures = [];
    for (const [rel, { subcommand, argless }] of Object.entries(PATTERN_B)) {
      if (!argless) continue; // covered by its own targeted test below
      const res = runCli(patternBPath(rel), [subcommand], { cwd: REPO_ROOT });
      if (res.missing) { failures.push(`${rel}: absent`); continue; }
      if (res.status !== 0) failures.push(`${rel} ${subcommand}: exit ${res.status} — ${res.out.slice(0, 160)}`);
      if (res.out.trim() === '') failures.push(`${rel}: produced no output, so nothing proves the subcommand ran`);
    }
    assert.deepEqual(failures, [], 'every argument-free Pattern B module must answer to its subcommand — that is the front door replacing the inline import');
  });

  // AC-014
  //
  // Every one of the six, including the three that need an argument: --help proves
  // the entry point exists and NAMES its subcommand, which is what a SOP author
  // reads to find the command. A module whose help omits its own subcommand is a
  // front door with no sign on it.
  it('test_when_pattern_b_module_helped_then_it_names_its_own_subcommand', () => {
    const failures = [];
    for (const [rel, { subcommand }] of Object.entries(PATTERN_B)) {
      const res = runCli(patternBPath(rel), ['--help'], { cwd: REPO_ROOT });
      if (res.missing) { failures.push(`${rel}: absent`); continue; }
      if (res.status !== 0) failures.push(`${rel} --help: exit ${res.status}`);
      if (!res.out.includes(subcommand)) failures.push(`${rel} --help: does not name \`${subcommand}\``);
    }
    assert.deepEqual(failures, [], 'a Pattern B module must document the subcommand it answers to');
  });

  // AC-014 — the three that require an argument must say so rather than no-op
  it('test_when_pattern_b_module_needs_an_argument_and_gets_none_then_usage_error', () => {
    const failures = [];
    for (const [rel, { subcommand, argless }] of Object.entries(PATTERN_B)) {
      if (argless) continue;
      const res = runCli(patternBPath(rel), [subcommand], { cwd: REPO_ROOT });
      if (res.missing) { failures.push(`${rel}: absent`); continue; }
      if (res.status !== 1) failures.push(`${rel} ${subcommand} (no argument): exit ${res.status}, want 1`);
    }
    assert.deepEqual(failures, [], 'a required argument that is missing is a usage error — never a silent empty result');
  });

  // AC-014
  it('test_when_pattern_b_module_given_unknown_subcommand_then_usage_and_exit_1', () => {
    const failures = [];
    for (const rel of Object.keys(PATTERN_B)) {
      const res = runCli(patternBPath(rel), ['definitely-not-a-subcommand'], { cwd: REPO_ROOT });
      if (res.missing) { failures.push(`${rel}: absent`); continue; }
      if (res.status !== 1) failures.push(`${rel}: exit ${res.status}, want 1`);
      if (!/usage/i.test(res.out)) failures.push(`${rel}: an unknown subcommand must print usage, not just fail`);
    }
    assert.deepEqual(failures, [], 'Pattern B honours the same exit contract as Pattern A: 0 ok, 1 usage, 2 not found');
  });
});

describe('Pattern B — imported as a library', () => {
  // AC-014
  //
  // The sentinel is the oracle. If the main-guard is missing, importing the module
  // runs it — and if it exits, the sentinel never prints. Asserting on the sentinel
  // rather than on the child's exit code distinguishes "the module ran and exited
  // cleanly" from "the module stayed inert", which an exit code alone cannot.
  it('test_when_pattern_b_module_imported_then_no_side_effect_and_no_exit', () => {
    const failures = [];
    for (const rel of Object.keys(PATTERN_B)) {
      const abs = join(REPO_ROOT, patternBPath(rel));
      if (!existsSync(abs)) { failures.push(`${rel}: absent`); continue; }
      const probe = `import(${JSON.stringify(abs)}).then(() => { process.stdout.write('SENTINEL'); }).catch((e) => { process.stdout.write('THREW:' + e.message); });`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
        cwd: REPO_ROOT, encoding: 'utf8',
      });
      const out = (res.stdout ?? '') + (res.stderr ?? '');
      if (!out.includes('SENTINEL')) {
        failures.push(`${rel}: importing it did not reach the sentinel — the main-guard is missing or it exits on load. Got: ${out.slice(0, 200)}`);
      }
      if (/^usage/im.test(res.stdout ?? '')) failures.push(`${rel}: printed usage on import`);
    }
    assert.deepEqual(failures, [], 'a module that is both command and library must stay inert on import — hooks and SOPs import these');
  });
});

describe('the async writer — a Pattern A dispatcher, because its module is a build mirror', () => {
  function prePost18(root) {
    const dir = join(root, '.claude', 'state');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'workflow.json');
    writeFileSync(path, JSON.stringify({ slug: 'x', entry_phase: 'spec', completed: [], exceptions: [] }, null, 2) + '\n', 'utf8');
    return path;
  }

  // AC-015
  //
  // This is the assertion that corrected D2. The spec decided dispatch() would stay
  // synchronous because the one async handler could carry its own entry point; the
  // build-mirror fact made that impossible, so dispatch() awaits instead. If the
  // await is ever removed, the handler's promise reaches emit as {} and process.exit
  // fires mid-write — the re-read below then finds truncated or pre-write content.
  // That is the whole reason this test re-reads the file rather than trusting the
  // exit code.
  it('test_when_migrator_migrates_then_awaited_write_completes_before_exit', () => {
    const root = mkdtemp();
    const path = prePost18(root);
    const res = runCli('harness', ['migrate', path], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 0, `migrate must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);

    const after = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(after.track_id, 'spec-entry', 'entry_phase spec must map to track_id spec-entry');
    assert.equal(after.entry_phase, undefined, 'the migrator removes entry_phase; finding it means the write did not complete');
    assert.ok(Array.isArray(after.skipped_alternates), 'the migrated shape must be complete, not partially written');
  });

  // AC-015
  it('test_when_migrator_given_unmapped_entry_phase_then_exit_1_names_phase_and_file_unchanged', () => {
    const root = mkdtemp();
    const dir = join(root, '.claude', 'state');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'workflow.json');
    const original = JSON.stringify({ slug: 'x', entry_phase: 'not-a-phase', completed: [] }, null, 2) + '\n';
    writeFileSync(path, original, 'utf8');

    const res = runCli('harness', ['migrate', path], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 1, 'an unmapped entry_phase is a validation error');
    assert.match(res.out, /not-a-phase/, 'the error must name the phase it could not map, or it is undiagnosable');
    assert.equal(readFileSync(path, 'utf8'), original, 'a failed migration must leave the file byte-identical');
  });

  // AC-015
  it('test_when_migrator_given_absent_path_then_exit_2_and_no_partial_write', () => {
    const root = mkdtemp();
    const path = join(root, 'nope', 'workflow.json');
    const res = runCli('harness', ['migrate', path], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 2, 'an absent target is not-found (2), not a usage error (1)');
    assert.ok(!existsSync(path), 'a not-found migration must not conjure the file it was asked to migrate');
  });

  // AC-014
  it('test_when_planner_given_malformed_json_then_exit_1', () => {
    const res = runCli(patternBPath('sprint-planner/planner.mjs'), ['select', '{bad json'], { cwd: REPO_ROOT });
    assertPresent(assert, res);
    assert.equal(res.status, 1, 'malformed input JSON is a usage error');
    assert.ok(res.stderr.trim().length > 0, 'the parse failure must reach stderr as a named reason, not a bare stack');
  });

  // The plain path is the one a human reads. `--json` was correct from the start,
  // so a suite that only exercised `--json` watched the half that already worked
  // while the default rendering returned the empty notice on every run.
  const runPlanner = (input, flags = []) =>
    runCli(patternBPath('sprint-planner/planner.mjs'), ['select', JSON.stringify(input), ...flags], { cwd: REPO_ROOT });

  const READY = { id: 'P1', epic: 3, title: 'value types', deps: [], priority: 1 };
  const ALSO_READY = { id: 'P2', epic: 3, title: 'activation', deps: [], priority: 2 };
  const BLOCKED = { id: 'S1', epic: 3, title: 'declare storage', deps: ['W1'], priority: 3 };
  const EMPTY_NOTICE = /no dependency-ready task/;

  it('test_when_planner_plain_output_and_a_ready_task_exists_then_it_prints_the_task_id', () => {
    const res = runPlanner({ tasks: [READY, BLOCKED], statusById: { W1: 'planned' } });
    assertPresent(assert, res);
    assert.equal(res.status, 0, 'a well-formed proposal is not an error');
    assert.match(res.stdout, /P1/, 'the plain path must name the task it selected');
    assert.doesNotMatch(res.stdout, EMPTY_NOTICE, 'a proposal with a ready task must not render as empty');
  });

  it('test_when_planner_plain_output_and_every_task_is_blocked_then_it_prints_the_empty_notice', () => {
    const res = runPlanner({ tasks: [BLOCKED], statusById: { W1: 'planned' } });
    assertPresent(assert, res);
    assert.equal(res.status, 0, 'an empty proposal is a valid answer, not an error');
    assert.match(res.stdout, EMPTY_NOTICE, 'nothing ready must still say so');
  });

  it('test_when_planner_plain_output_capacity_capped_then_it_prints_only_the_capped_tasks', () => {
    const res = runPlanner({ tasks: [READY, ALSO_READY], statusById: {} }, ['--capacity', '1']);
    assertPresent(assert, res);
    assert.equal(res.status, 0, 'a capped proposal is not an error');
    const named = ['P1', 'P2'].filter((id) => res.stdout.includes(id));
    assert.deepEqual(named, ['P1'], 'the plain path must render the capacity-sliced selection, not every ready task');
  });
});
