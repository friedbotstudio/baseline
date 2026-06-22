import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Core handlers do not exist yet — import fails RED until /implement writes them.
import {
  registerPeer, sendMessage, broadcast, claimTask, signalDone, raiseConflict, yieldFork,
} from '../.claude/mcp/sprint-channel/handlers.mjs';

// --- Foundation: real temp channel-root fixtures (no mocks) ---
function mkChannel({ tasks = [], peers = [], yields = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sprint-chan-'));
  writeFileSync(join(root, 'sprint.json'), JSON.stringify({ sprint_id: 's1', status: 'active', peers }));
  writeFileSync(join(root, 'tasks.json'), JSON.stringify(tasks));
  writeFileSync(join(root, 'yields.json'), JSON.stringify(yields));
  writeFileSync(join(root, 'mailbox.jsonl'), '');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
const readJson = (root, name) => JSON.parse(readFileSync(join(root, name), 'utf8'));
const task = (id, over = {}) => ({ id, write_set: [id.toLowerCase()], depends_on: [], status: 'pending', claimed_by: null, commit_sha: null, ...over });

test('test_when_register_peer_then_persisted_and_reregister_is_noop', () => {
  const ch = mkChannel();
  try {
    const r1 = registerPeer({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'p1', pclass: 'worker', role: 'impl', workspace: '/tmp/w1' });
    assert.equal(r1.ok, true);
    assert.equal(r1.registered, true);
    registerPeer({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'p1', pclass: 'worker', role: 'impl', workspace: '/tmp/w1' });
    const sprint = readJson(ch.root, 'sprint.json');
    assert.equal(sprint.peers.filter((p) => p.peer_id === 'p1').length, 1, 'idempotent — one record for p1');
  } finally { ch.cleanup(); }
});

test('test_when_two_peers_claim_same_task_then_exactly_one_wins', () => {
  const ch = mkChannel({ tasks: [task('T1')] });
  try {
    const a = claimTask({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pA', task_id: 'T1' });
    const b = claimTask({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pB', task_id: 'T1' });
    assert.equal([a, b].filter((r) => r.claimed === true).length, 1, 'exactly one claim wins');
    assert.equal(a.claimed, true);
    assert.equal(b.claimed, false);
  } finally { ch.cleanup(); }
});

test('test_when_claim_task_with_unmet_dependency_then_claimed_false', () => {
  const ch = mkChannel({ tasks: [task('T1'), task('T2', { depends_on: ['T1'] })] });
  try {
    const r = claimTask({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pA', task_id: 'T2' });
    assert.equal(r.claimed, false);
    assert.match(String(r.reason), /T1|dep/i, 'reason names the unmet dependency');
  } finally { ch.cleanup(); }
});

test('test_when_claim_task_unknown_task_then_error', () => {
  const ch = mkChannel({ tasks: [] });
  try {
    const r = claimTask({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pA', task_id: 'NOPE' });
    assert.equal(r.claimed, false);
    assert.match(String(r.reason), /unknown|not found/i);
  } finally { ch.cleanup(); }
});

test('test_when_signal_done_then_returns_unblocked_dependents', () => {
  const ch = mkChannel({ tasks: [task('T1', { status: 'claimed', claimed_by: 'pA' }), task('T2', { depends_on: ['T1'] })] });
  try {
    const r = signalDone({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pA', task_id: 'T1' });
    assert.deepEqual(r.unblocked, ['T2']);
    assert.equal(readJson(ch.root, 'tasks.json').find((t) => t.id === 'T1').status, 'done');
  } finally { ch.cleanup(); }
});

test('test_when_signal_done_by_non_claimer_then_rejected', () => {
  const ch = mkChannel({ tasks: [task('T1', { status: 'claimed', claimed_by: 'pA' })] });
  try {
    const r = signalDone({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pB', task_id: 'T1' });
    assert.equal(r.ok, false, 'non-claimer is rejected');
    assert.equal(readJson(ch.root, 'tasks.json').find((t) => t.id === 'T1').status, 'claimed', 'task stays claimed');
  } finally { ch.cleanup(); }
});

test('test_when_send_message_type_outside_closed_enum_then_rejected', () => {
  const ch = mkChannel({ peers: [{ peer_id: 'pA' }, { peer_id: 'pB' }] });
  try {
    const r = sendMessage({ channelRoot: ch.root, sprint_id: 's1', from: 'pA', to: 'pB', type: 'DIRECTIVE', payload: {} });
    assert.equal(r.delivered, false, 'a type outside the closed enum is rejected');
    assert.equal(readFileSync(join(ch.root, 'mailbox.jsonl'), 'utf8').trim(), '', 'rejected message is not appended');
  } finally { ch.cleanup(); }
});

test('test_when_broadcast_then_delivered_count_equals_registered_peers', () => {
  const ch = mkChannel({ peers: [{ peer_id: 'pA' }, { peer_id: 'pB' }, { peer_id: 'pC' }] });
  try {
    const r = broadcast({ channelRoot: ch.root, sprint_id: 's1', from: 'pA', type: 'STATUS', payload: { msg: 'hi' } });
    assert.equal(r.delivered_count, 2, 'delivered to the 2 peers other than the sender');
  } finally { ch.cleanup(); }
});

test('test_when_yield_fork_then_recorded_and_plan_version_increments', () => {
  const ch = mkChannel({ tasks: [task('T1', { status: 'claimed', claimed_by: 'pA' })] });
  try {
    const r1 = yieldFork({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pA', task_id: 'T1', fork_desc: 'which lib?' });
    assert.equal(r1.recorded, true);
    const r2 = yieldFork({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pA', task_id: 'T1', fork_desc: 'which pattern?' });
    assert.ok(r2.plan_version > r1.plan_version, 'plan_version increments per yield');
    assert.equal(readJson(ch.root, 'yields.json').length, 2);
  } finally { ch.cleanup(); }
});

test('test_when_raise_conflict_then_ack_arbiter_lead_and_recorded', () => {
  const ch = mkChannel({ tasks: [task('T1', { status: 'claimed', claimed_by: 'pA' })] });
  try {
    const r = raiseConflict({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pA', task_id: 'T1', path: 'a' });
    assert.equal(r.ack, true);
    assert.equal(r.arbiter, 'lead');
  } finally { ch.cleanup(); }
});

// --- Security: peer-supplied ids must not traverse out of channelRoot (CWE-22) ---
import { existsSync } from 'node:fs';
import { dirname, basename } from 'node:path';

test('test_when_claim_task_with_path_traversal_id_then_rejected_and_no_escape', () => {
  const ch = mkChannel({ tasks: [task('T1')] });
  try {
    const evil = `../evil-${basename(ch.root)}`;
    const r = claimTask({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pA', task_id: evil });
    assert.equal(r.claimed, false);
    assert.match(String(r.reason), /invalid/i, 'a traversal task_id is rejected before any fs write');
    assert.equal(existsSync(join(dirname(ch.root), `.lock-task-${evil}`)), false, 'no lock dir escaped channelRoot');
  } finally { ch.cleanup(); }
});

test('test_when_signal_done_with_traversal_id_then_rejected', () => {
  const ch = mkChannel({ tasks: [task('T1', { status: 'claimed', claimed_by: 'pA' })] });
  try {
    const r = signalDone({ channelRoot: ch.root, sprint_id: 's1', peer_id: 'pA', task_id: '../../etc/x' });
    assert.equal(r.ok, false);
    assert.match(String(r.error), /invalid/i);
  } finally { ch.cleanup(); }
});

test('test_when_register_peer_with_invalid_id_then_rejected', () => {
  const ch = mkChannel();
  try {
    const r = registerPeer({ channelRoot: ch.root, sprint_id: 's1', peer_id: '../evil', pclass: 'worker', role: 'x', workspace: '/w' });
    assert.equal(r.ok, false);
    assert.match(String(r.error), /invalid/i);
    assert.equal((readJson(ch.root, 'sprint.json').peers || []).length, 0, 'invalid peer not persisted');
  } finally { ch.cleanup(); }
});
