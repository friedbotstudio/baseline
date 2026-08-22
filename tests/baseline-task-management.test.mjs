// Epic 13 (baseline-mcp) Slice C — general task management on the baseline server.
//
// Covers AC-010, AC-011, AC-012, AC-013, AC-014 of docs/specs/baseline-mcp.md.
//
// Two changes, one slice. First, `sprint_id` becomes optional: it resolves to the
// literal `default` channel, so the task tools are usable by a solo session with org
// mode off — today every tool demands a channel id that only an org run has.
//
// Second, `TaskStatus` widens from {pending, claimed, done} to add `in_progress` and
// `cancelled`. `in_progress` exists because a claimed task and a task actually being
// worked are not the same thing and today they are indistinguishable. `cancelled`
// exists because the only way to retire a task now is to mark it `done`, which lies
// to every dependent: they unblock as though the work happened.
//
// AC-014 is the regression trap. State written before the widening must parse
// unchanged, and `claim_task` must keep its single-winner guarantee — a status enum
// is exactly the kind of change that quietly breaks a lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const { TASK_STATUSES, resolveChannelId, DEFAULT_CHANNEL_ID, isClaimable, satisfiesDependency } =
  await import('../.claude/mcp/baseline/lib/tasks.mjs');
const { enqueueTask, claimTask, signalDone, updateTask, cancelTask, listTasks } =
  await import('../.claude/mcp/baseline/handlers.mjs');

function mkChannel({ tasks = [], peers = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'baseline-tasks-'));
  writeFileSync(join(root, 'sprint.json'), JSON.stringify({ sprint_id: 's1', status: 'active', peers }));
  writeFileSync(join(root, 'tasks.json'), JSON.stringify(tasks));
  writeFileSync(join(root, 'yields.json'), JSON.stringify([]));
  writeFileSync(join(root, 'mailbox.jsonl'), '');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
const readTasksFile = (root) => JSON.parse(readFileSync(join(root, 'tasks.json'), 'utf8'));
const task = (id, over = {}) => ({ id, write_set: [], depends_on: [], status: 'pending', claimed_by: null, commit_sha: null, ...over });

// --- AC-010 / AC-011: the default channel -----------------------------------

test('test_when_no_sprint_id_is_given_then_it_resolves_to_the_default_channel', () => {
  // AC-010. Absent, empty and whitespace are all "the caller named no channel".
  assert.equal(DEFAULT_CHANNEL_ID, 'default');
  for (const absent of [undefined, null, '', '   ']) {
    assert.equal(resolveChannelId(absent), 'default', `${JSON.stringify(absent)} must resolve to the default channel`);
  }
});

test('test_when_an_explicit_sprint_id_is_given_then_it_is_returned_unchanged', () => {
  // AC-011. The override has to survive resolution or org mode loses its isolation.
  assert.equal(resolveChannelId('feature-x'), 'feature-x');
});

test('test_when_the_channel_id_is_unsafe_then_resolution_refuses_it', () => {
  // The resolved id becomes a path component, so the CWE-22 guard has to run here
  // too — a default that bypassed it would be a new hole, not a convenience.
  for (const hostile of ['../escape', 'a/b', 'x y']) {
    assert.throws(() => resolveChannelId(hostile), /channel id/i, `${JSON.stringify(hostile)} must be refused`);
  }
});

test('test_when_two_channels_are_used_then_their_task_sets_stay_separate', () => {
  // AC-011. The isolation is the point of an explicit id.
  const a = mkChannel();
  const b = mkChannel();
  try {
    enqueueTask({ channelRoot: a.root, task_id: 'T1', brief: 'in a' });
    enqueueTask({ channelRoot: b.root, task_id: 'T2', brief: 'in b' });
    assert.deepEqual(readTasksFile(a.root).map((t) => t.id), ['T1']);
    assert.deepEqual(readTasksFile(b.root).map((t) => t.id), ['T2']);
  } finally { a.cleanup(); b.cleanup(); }
});

// --- AC-012: claimed, in_progress and done are distinguishable ---------------

test('test_when_the_status_enum_is_read_then_it_carries_all_five_states', () => {
  assert.deepEqual(TASK_STATUSES, ['pending', 'claimed', 'in_progress', 'done', 'cancelled']);
});

test('test_when_a_claimed_task_is_started_then_its_status_becomes_in_progress', () => {
  // AC-012. Claimed and being-worked are different facts; today they are one.
  const ch = mkChannel({ tasks: [task('T1')] });
  try {
    assert.equal(claimTask({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T1' }).claimed, true);
    const r = updateTask({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T1', status: 'in_progress' });
    assert.equal(r.ok, true);

    const [t] = readTasksFile(ch.root);
    assert.equal(t.status, 'in_progress');
    assert.equal(t.claimed_by, 'pA', 'starting work must not drop the claim');

    assert.equal(signalDone({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T1' }).ok, true);
    assert.equal(readTasksFile(ch.root)[0].status, 'done');
  } finally { ch.cleanup(); }
});

test('test_when_a_peer_that_does_not_hold_the_claim_updates_then_it_is_refused', () => {
  // The claim is what authorises the transition; without this check any peer could
  // move another peer's lane.
  const ch = mkChannel({ tasks: [task('T1')] });
  try {
    claimTask({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T1' });
    const r = updateTask({ channelRoot: ch.root, peer_id: 'pB', task_id: 'T1', status: 'in_progress' });
    assert.equal(r.ok, false);
    assert.match(String(r.error), /claim/i);
    assert.equal(readTasksFile(ch.root)[0].status, 'claimed', 'the refused update must not have landed');
  } finally { ch.cleanup(); }
});

test('test_when_an_update_names_a_status_outside_the_enum_then_it_is_refused', () => {
  const ch = mkChannel({ tasks: [task('T1')] });
  try {
    claimTask({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T1' });
    const r = updateTask({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T1', status: 'nonsense' });
    assert.equal(r.ok, false);
    assert.equal(readTasksFile(ch.root)[0].status, 'claimed');
  } finally { ch.cleanup(); }
});

// --- AC-013: a cancelled task ------------------------------------------------

test('test_when_a_task_is_cancelled_then_it_cannot_be_claimed', () => {
  // AC-013, first half.
  const ch = mkChannel({ tasks: [task('T1')] });
  try {
    assert.equal(cancelTask({ channelRoot: ch.root, task_id: 'T1' }).ok, true);
    assert.equal(readTasksFile(ch.root)[0].status, 'cancelled');

    const r = claimTask({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T1' });
    assert.equal(r.claimed, false);
    assert.match(String(r.reason), /cancel/i, 'the refusal must say the task was cancelled');
  } finally { ch.cleanup(); }
});

test('test_when_a_dependency_is_cancelled_then_it_stops_blocking_its_dependents', () => {
  // AC-013, second half — and the reason `cancelled` exists at all. Marking the
  // dependency `done` would unblock T2 while claiming work happened that did not.
  const ch = mkChannel({ tasks: [task('T1'), task('T2', { depends_on: ['T1'] })] });
  try {
    cancelTask({ channelRoot: ch.root, task_id: 'T1' });
    const r = claimTask({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T2' });
    assert.equal(r.claimed, true, 'a cancelled dependency must not block its dependents');
  } finally { ch.cleanup(); }
});

test('test_when_a_dependency_is_still_open_then_it_blocks_as_before', () => {
  // Regression trap for the change above: making cancelled non-blocking must not
  // make everything non-blocking.
  const ch = mkChannel({ tasks: [task('T1'), task('T2', { depends_on: ['T1'] })] });
  try {
    const r = claimTask({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T2' });
    assert.equal(r.claimed, false);
    assert.match(String(r.reason), /T1|dep/i);
  } finally { ch.cleanup(); }
});

test('test_when_a_dependent_unblocks_then_a_cancelled_sibling_is_not_reported_done', () => {
  // AC-013, third half: cancelled and done must stay distinguishable to a reader.
  const ch = mkChannel({ tasks: [task('T1'), task('T2'), task('T3', { depends_on: ['T1', 'T2'] })] });
  try {
    cancelTask({ channelRoot: ch.root, task_id: 'T2' });
    claimTask({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T1' });
    const r = signalDone({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T1' });
    assert.deepEqual(r.unblocked, ['T3'], 'T3 unblocks once its only live dependency is done');

    const byId = Object.fromEntries(readTasksFile(ch.root).map((t) => [t.id, t.status]));
    assert.equal(byId.T1, 'done');
    assert.equal(byId.T2, 'cancelled', 'a cancelled task must never be rewritten as done');
  } finally { ch.cleanup(); }
});

test('test_when_a_done_task_is_cancelled_then_it_is_refused', () => {
  // Cancelling completed work would erase the record that it happened.
  const ch = mkChannel({ tasks: [task('T1', { status: 'done', claimed_by: 'pA' })] });
  try {
    const r = cancelTask({ channelRoot: ch.root, task_id: 'T1' });
    assert.equal(r.ok, false);
    assert.equal(readTasksFile(ch.root)[0].status, 'done');
  } finally { ch.cleanup(); }
});

test('test_when_the_predicates_are_called_then_they_agree_with_the_handlers', () => {
  assert.equal(isClaimable('pending'), true);
  for (const s of ['claimed', 'in_progress', 'done', 'cancelled']) assert.equal(isClaimable(s), false, s);
  for (const s of ['done', 'cancelled']) assert.equal(satisfiesDependency(s), true, s);
  for (const s of ['pending', 'claimed', 'in_progress']) assert.equal(satisfiesDependency(s), false, s);
});

// --- AC-010: listing ---------------------------------------------------------

test('test_when_tasks_are_listed_then_every_status_is_reported_as_stored', () => {
  const ch = mkChannel({ tasks: [task('T1'), task('T2', { status: 'cancelled' }), task('T3', { status: 'done' })] });
  try {
    const r = listTasks({ channelRoot: ch.root });
    assert.equal(r.ok, true);
    assert.deepEqual(r.tasks.map((t) => [t.id, t.status]), [['T1', 'pending'], ['T2', 'cancelled'], ['T3', 'done']]);
  } finally { ch.cleanup(); }
});

// --- AC-014: the regression trap ---------------------------------------------

test('test_when_pre_widening_state_is_read_then_it_parses_unchanged', () => {
  // AC-014. A task file written before this slice carries only the three old
  // statuses and no field the widening added.
  const legacy = [
    { id: 'T1', write_set: ['a'], depends_on: [], status: 'pending', claimed_by: null, commit_sha: null },
    { id: 'T2', write_set: ['b'], depends_on: ['T1'], status: 'claimed', claimed_by: 'pA', commit_sha: null },
    { id: 'T3', write_set: ['c'], depends_on: [], status: 'done', claimed_by: 'pB', commit_sha: 'abc123' },
  ];
  const ch = mkChannel({ tasks: legacy });
  try {
    const r = listTasks({ channelRoot: ch.root });
    assert.deepEqual(r.tasks, legacy, 'reading legacy state must not rewrite or annotate it');
    assert.deepEqual(readTasksFile(ch.root), legacy, 'and must not write to disk at all');
  } finally { ch.cleanup(); }
});

test('test_when_two_peers_claim_the_same_task_then_exactly_one_still_wins', () => {
  // AC-014. The widening touches the claim path, which is the one place a lost
  // single-winner guarantee would be silent.
  const ch = mkChannel({ tasks: [task('T1')] });
  try {
    const a = claimTask({ channelRoot: ch.root, peer_id: 'pA', task_id: 'T1' });
    const b = claimTask({ channelRoot: ch.root, peer_id: 'pB', task_id: 'T1' });
    assert.equal([a, b].filter((r) => r.claimed === true).length, 1, 'exactly one claim wins');
    assert.equal(readTasksFile(ch.root)[0].claimed_by, 'pA');
  } finally { ch.cleanup(); }
});

// --- the server surface ------------------------------------------------------

test('test_when_the_server_is_read_then_sprint_id_is_optional_and_resolved', () => {
  // AC-010 at the tool boundary. The handlers can default all they like; if the
  // schema still demands `sprint_id` the solo session never reaches them.
  const server = readFileSync(join(ROOT, '.claude/mcp/baseline/server.mjs'), 'utf8');
  assert.ok(/resolveChannelId/.test(server), 'the server must resolve the channel id');
  // The tool table lives in tools.mjs; the schemas it declares are what this checks.
  const src = readFileSync(join(ROOT, '.claude/mcp/baseline/tools.mjs'), 'utf8');
  const required = src.match(/sprint_id:\s*z\.string\(\)(?!\.optional)/g) || [];
  assert.deepEqual(required, [], 'every sprint_id must be optional');
  for (const name of ['update_task', 'cancel_task', 'list_tasks']) {
    assert.ok(src.includes(`'${name}'`), `the server must register ${name}`);
  }
});
