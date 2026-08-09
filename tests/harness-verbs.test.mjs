// T-008 — harness/cli.mjs gains the `rightsize` and `state` verbs.
// AC-005 (verb/direct-path parity), AC-008 (state), AC-011 (--json), AC-012 (exits),
// AC-014 (rightsize-gate.mjs exposes a data-returning entry).
//
// Why rightsize-gate.mjs had to change: it already exported `main`, but `main`
// writes its JSON to process.stdout itself and returns an exit code. A dispatcher
// verb needs the DATA — printing is the dispatcher's job, and letting the helper
// print too would put two JSON documents on stdout and break AC-011. Exporting
// something named `main` is not the same as exposing a callable entry.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = process.cwd();
const CLI = join(REPO, '.claude/skills/harness/cli.mjs');
const GATE = join(REPO, '.claude/skills/harness/rightsize-gate.mjs');

// Returns {code, stdout, stderr} instead of throwing, because half these cases
// assert a non-zero exit and execFileSync's throw would hide the body.
function run(args, opts = {}) {
  try {
    const stdout = execFileSync('node', args, { encoding: 'utf8', cwd: opts.cwd || REPO, stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ? String(e.stdout) : '', stderr: e.stderr ? String(e.stderr) : '' };
  }
}

function makeWorkflowProject({ workflow }) {
  const root = mkdtempSync(join(tmpdir(), 'harness-verbs-'));
  mkdirSync(join(root, '.claude', 'state'), { recursive: true });
  if (workflow !== undefined) {
    writeFileSync(join(root, '.claude', 'state', 'workflow.json'),
      typeof workflow === 'string' ? workflow : JSON.stringify(workflow, null, 2));
  }
  // The `next` computation reads the track DAG; copy the real one so the test
  // exercises the shipped track shapes rather than a hand-rolled stand-in.
  writeFileSync(join(root, '.claude', 'workflows.jsonl'),
    readFileSync(join(REPO, '.claude', 'workflows.jsonl'), 'utf8'));
  return root;
}

describe('AC-014 — rightsize-gate exposes a data-returning entry', () => {
  it('test_when_run_rightsize_imported_then_it_returns_a_decision_instead_of_printing', async () => {
    const mod = await import(GATE);

    assert.equal(typeof mod.runRightsize, 'function', 'rightsize-gate.mjs must export runRightsize');

    const result = await mod.runRightsize({ sub: 'check', rootDir: REPO });
    assert.ok(result && typeof result === 'object', 'runRightsize returns the decision as data');
    for (const key of ['skip', 'keep', 'advisories']) {
      assert.ok(key in result, `the decision carries ${key}`);
    }
    assert.ok(Array.isArray(result.skip) && Array.isArray(result.keep));
  });

  it('test_when_run_rightsize_given_unknown_sub_then_it_fails_open', async () => {
    const mod = await import(GATE);
    const result = await mod.runRightsize({ sub: 'nonsense', rootDir: REPO });

    // Fail-open is the gate's contract: it may never skip a phase by accident.
    assert.deepEqual(result.skip, [], 'an unknown subcommand skips nothing');
    assert.ok(result.keep.includes('security'), 'security is never skippable');
  });
});

describe('AC-005 — the rightsize verb and the direct path agree', () => {
  it('test_when_rightsize_check_runs_via_verb_and_directly_then_decisions_match', () => {
    const direct = run([GATE, 'check']);
    const verb = run([CLI, 'rightsize', 'check', '--json']);

    assert.equal(direct.code, 0, 'the direct path still exits 0');
    assert.equal(verb.code, 0, 'the verb exits 0');

    const a = JSON.parse(direct.stdout);
    const b = JSON.parse(verb.stdout);
    assert.deepEqual(
      { skip: b.skip, keep: b.keep },
      { skip: a.skip, keep: a.keep },
      'both paths reach the same skip/keep decision',
    );
  });

  it('test_when_rightsize_gate_invoked_directly_then_main_guard_still_fires', () => {
    const direct = run([GATE, 'check']);
    assert.equal(direct.code, 0);
    assert.doesNotThrow(() => JSON.parse(direct.stdout), 'the direct path still prints its JSON itself');
  });
});

describe('AC-008 — the state verb reports the live workflow', () => {
  it('test_when_workflow_present_then_state_reports_track_completed_exceptions_and_next', () => {
    const root = makeWorkflowProject({
      workflow: {
        slug: 'demo', track_id: 'chore',
        completed: ['tdd'], exceptions: ['intake', 'scout', 'research', 'spec'],
        tickets: [{ id: 'X1', title: 'a ticket' }],
      },
    });

    const r = run([CLI, 'state', '--json'], { cwd: root });
    assert.equal(r.code, 0, r.stderr);
    const state = JSON.parse(r.stdout);

    assert.equal(state.slug, 'demo');
    assert.equal(state.track_id, 'chore');
    assert.deepEqual(state.completed, ['tdd']);
    assert.ok(state.exceptions.includes('intake'));
    assert.deepEqual(state.tickets.map((t) => t.id), ['X1']);
    assert.ok('next' in state, 'state names the next phase due');
  });

  it('test_when_next_computed_then_it_is_neither_completed_nor_excepted', () => {
    const root = makeWorkflowProject({
      workflow: {
        slug: 'demo', track_id: 'chore',
        completed: ['tdd'], exceptions: ['intake', 'scout', 'research', 'spec'],
      },
    });

    const state = JSON.parse(run([CLI, 'state', '--json'], { cwd: root }).stdout);
    if (state.next !== null) {
      assert.ok(!state.completed.includes(state.next), 'next is not already completed');
      assert.ok(!state.exceptions.includes(state.next), 'next is not excepted');
    }
  });

  it('test_when_workflow_absent_then_state_exits_two_with_a_named_error', () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-verbs-empty-'));
    mkdirSync(join(root, '.claude', 'state'), { recursive: true });

    const r = run([CLI, 'state', '--json'], { cwd: root });
    assert.equal(r.code, 2, 'an absent workflow is not-found, not a usage error');
    assert.match(r.stderr + r.stdout, /workflow/i, 'the error names what is missing');
  });

  it('test_when_workflow_malformed_then_state_exits_one_with_a_named_error', () => {
    const root = makeWorkflowProject({ workflow: '{ not json' });

    const r = run([CLI, 'state', '--json'], { cwd: root });
    assert.equal(r.code, 1, 'malformed JSON is a usage error, not not-found');
    assert.match(r.stderr + r.stdout, /json/i, 'the error says the file is not valid JSON');
  });
});

describe('AC-011 / AC-012 — output and exit contract', () => {
  it('test_when_verbs_run_with_json_then_stdout_is_parseable_json_only', () => {
    for (const args of [['rightsize', 'check', '--json'], ['state', '--json']]) {
      const r = run([CLI, ...args]);
      if (r.code !== 0) continue; // state needs a workflow; covered above
      assert.doesNotThrow(() => JSON.parse(r.stdout), `${args.join(' ')} must emit JSON only`);
    }
  });

  it('test_when_unknown_subcommand_then_usage_on_stderr_and_exit_one', () => {
    const r = run([CLI, 'bogus']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /unknown subcommand/i);
  });

  it('test_when_migrate_verb_still_present_then_the_existing_front_door_is_intact', () => {
    const r = run([CLI, '--help']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /migrate/, 'the pre-existing verb survives the addition');
    assert.match(r.stdout, /rightsize/, 'rightsize is listed');
    assert.match(r.stdout, /state/, 'state is listed');
  });
});
