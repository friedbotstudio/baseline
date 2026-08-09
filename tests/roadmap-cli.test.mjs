// Ticket read-front-door-sweep — T-004 (AC-001, AC-004, AC-011, AC-012).
//
// Exercises the `roadmap/cli.mjs` front door: `tasks`, `epics`, `next`. Every
// verb is proven under `--json` (AC-011: parseable JSON, nothing else on
// stdout) and against the shared dispatcher's error contract (AC-012: usage
// errors exit 1, not-found exits 2). `next` defends file order, not a
// dependency solve (AC-004) — ordering the graph is roadmap-planner's job.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runCli, runCliJson, assertPresent } from './helpers/cli-runner.mjs';

const CLI = '.claude/skills/roadmap/cli.mjs';
const DEFAULT_ROADMAP_PATH = 'docs/roadmap-execution-plan.md';

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'roadmapcli-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  return { root };
}

function writeFile(root, relPath, content) {
  const path = join(root, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

function writeRoadmap(root, content, relPath = DEFAULT_ROADMAP_PATH) {
  return writeFile(root, relPath, content);
}

const SAMPLE_ROADMAP = [
  '# Test roadmap',
  '',
  '## Epic 1 — Alpha ✅ (alpha)',
  '',
  '- ✅ T1. First task done.',
  '- ⬜ T2. Second task planned.',
  '',
  '## Epic 2 — Beta 🟡 (beta)',
  '',
  '- 🟡 T3. Third task in progress.',
  '- ⬜ T4. Fourth task planned.',
  '',
].join('\n');

const ALL_DONE_ROADMAP = [
  '## Epic 1 — Alpha ✅ (alpha)',
  '',
  '- ✅ T1. First task done.',
  '- ✅ T2. Second task done.',
  '',
].join('\n');

describe('roadmap/cli.mjs tasks (AC-001, AC-011)', () => {
  it('test_when_tasks_verb_runs_then_every_row_is_emitted_as_json', () => {
    const { root } = makeProject();
    writeRoadmap(root, SAMPLE_ROADMAP);
    const res = runCliJson(CLI, ['tasks', '--json', '--root', root]);
    assertPresent(assert, res);
    assert.equal(res.status, 0);
    assert.ok(res.json, `stdout must be parseable JSON, got: ${res.stdout}`);
    assert.equal(res.stderr, '', 'nothing but JSON should reach stdout/stderr on success');
    assert.ok(Array.isArray(res.json.tasks), '{tasks:[...]} shape expected');
    assert.equal(res.json.tasks.length, 4);
    assert.deepEqual(
      res.json.tasks.map((t) => t.id),
      ['T1', 'T2', 'T3', 'T4'],
    );
  });

  it('test_when_tasks_filtered_by_epic_then_only_that_epic_s_rows_return', () => {
    const { root } = makeProject();
    writeRoadmap(root, SAMPLE_ROADMAP);

    const res = runCliJson(CLI, ['tasks', '--epic', '2', '--json', '--root', root]);
    assertPresent(assert, res);
    assert.equal(res.status, 0);
    assert.ok(res.json);
    assert.deepEqual(
      res.json.tasks.map((t) => t.id),
      ['T3', 'T4'],
    );
    assert.ok(res.json.tasks.every((t) => t.epicNum === 2));

    const empty = runCliJson(CLI, ['tasks', '--epic', '99', '--json', '--root', root]);
    assert.equal(empty.status, 0);
    assert.deepEqual(empty.json.tasks, []);
  });

  it('test_when_tasks_filtered_by_status_then_only_matching_rows_return', () => {
    const { root } = makeProject();
    writeRoadmap(root, SAMPLE_ROADMAP);

    const res = runCliJson(CLI, ['tasks', '--status', 'planned', '--json', '--root', root]);
    assertPresent(assert, res);
    assert.equal(res.status, 0);
    assert.deepEqual(
      res.json.tasks.map((t) => t.id),
      ['T2', 'T4'],
    );
    assert.ok(res.json.tasks.every((t) => t.status === 'planned'));
  });
});

describe('roadmap/cli.mjs epics (AC-001, AC-011)', () => {
  it('test_when_epics_verb_runs_then_each_epic_carries_its_tally', () => {
    const { root } = makeProject();
    writeRoadmap(root, SAMPLE_ROADMAP);

    const res = runCliJson(CLI, ['epics', '--json', '--root', root]);
    assertPresent(assert, res);
    assert.equal(res.status, 0);
    assert.ok(res.json, `stdout must be parseable JSON, got: ${res.stdout}`);
    assert.equal(res.stderr, '');
    assert.ok(Array.isArray(res.json.epics));
    assert.equal(res.json.epics.length, 2);
    for (const epic of res.json.epics) {
      assert.ok('num' in epic, 'epic must carry num');
      assert.ok('title' in epic, 'epic must carry title');
      assert.ok('tag' in epic, 'epic must carry tag');
      assert.ok('status' in epic, 'epic must carry status');
      assert.ok('tally' in epic, 'epic must carry tally');
    }
    const [epic1, epic2] = res.json.epics;
    assert.deepEqual(epic1.tally, { done: 1, inProgress: 0, planned: 1 });
    assert.deepEqual(epic2.tally, { done: 0, inProgress: 1, planned: 1 });
  });
});

describe('roadmap/cli.mjs next (AC-004)', () => {
  it('test_when_next_verb_runs_and_a_planned_task_exists_then_first_in_file_order_returns', () => {
    const { root } = makeProject();
    writeRoadmap(root, SAMPLE_ROADMAP);

    const res = runCliJson(CLI, ['next', '--json', '--root', root]);
    assertPresent(assert, res);
    assert.equal(res.status, 0);
    assert.ok(res.json, `stdout must be parseable JSON, got: ${res.stdout}`);
    assert.equal(res.stderr, '');
    assert.ok(res.json.task, 'a planned task must be returned');
    assert.equal(res.json.task.id, 'T2', 'the first planned task in FILE ORDER, not a dependency solve');
    assert.ok(res.json.epic, 'the owning epic must be returned');
    assert.equal(res.json.epic.num, 1);
    assert.equal(res.json.epic.title, 'Alpha');
    assert.equal(res.json.epic.tag, 'alpha');
  });

  it('test_when_next_verb_runs_and_nothing_is_planned_then_null_task_and_exit_zero', () => {
    const { root } = makeProject();
    writeRoadmap(root, ALL_DONE_ROADMAP);

    const res = runCliJson(CLI, ['next', '--json', '--root', root]);
    assertPresent(assert, res);
    assert.equal(res.status, 0, 'no planned task is a valid result, not an error');
    assert.ok(res.json, `stdout must be parseable JSON, got: ${res.stdout}`);
    assert.equal(res.json.task, null);
    assert.equal(res.json.reason, 'no planned task');
  });
});

describe('roadmap/cli.mjs — not-found contract (AC-012)', () => {
  it('test_when_roadmap_absent_then_verbs_exit_two_with_named_error', () => {
    const { root } = makeProject();
    const missingPath = join(root, DEFAULT_ROADMAP_PATH);

    for (const args of [['tasks', '--json'], ['epics', '--json'], ['next', '--json']]) {
      const res = runCli(CLI, [...args, '--root', root]);
      assertPresent(assert, res);
      assert.equal(res.status, 2, `${args[0]} must exit 2 when the roadmap file is absent`);
      assert.ok(
        res.stderr.includes(missingPath) || res.stderr.includes(DEFAULT_ROADMAP_PATH),
        `stderr must name the missing path, got: ${res.stderr}`,
      );
      assert.equal(res.stdout, '', 'no stack trace or partial JSON on stdout for a not-found error');
    }
  });
});

describe('roadmap/cli.mjs — usage error contract (AC-012)', () => {
  it('test_when_unknown_subcommand_then_usage_on_stderr_and_exit_one', () => {
    const { root } = makeProject();
    writeRoadmap(root, SAMPLE_ROADMAP);

    const res = runCli(CLI, ['bogus', '--root', root]);
    assertPresent(assert, res);
    assert.equal(res.status, 1);
    assert.ok(/unknown subcommand/i.test(res.stderr), `stderr must carry usage, got: ${res.stderr}`);
  });

  it('test_when_status_flag_has_no_value_then_usage_error_exit_one', () => {
    const { root } = makeProject();
    writeRoadmap(root, SAMPLE_ROADMAP);

    const res = runCli(CLI, ['tasks', '--root', root, '--status']);
    assertPresent(assert, res);
    assert.equal(res.status, 1);
    assert.ok(
      res.stderr.includes('--status requires a value'),
      `stderr must name the missing flag, got: ${res.stderr}`,
    );
  });
});
