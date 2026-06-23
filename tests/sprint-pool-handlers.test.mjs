import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';

// Pool handlers do not exist yet — import fails RED until /implement writes them.
import {
  enqueueTask, registerPoolPeer, leavePeer, releaseTask,
} from '../.claude/mcp/sprint-pool/handlers.mjs';
// AC-003 single-winner is provided by the unchanged baseline claim_task; this test
// exercises it through the pool re-dispatch path (release → race two claims).
import { claimTask } from '../.claude/mcp/sprint-channel/handlers.mjs';

// --- Foundation: real temp channel-root fixtures (no mocks) ---
function mkChannel({ tasks = [], peers = [], yields = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sprint-pool-'));
  writeFileSync(join(root, 'sprint.json'), JSON.stringify({ sprint_id: 'lobby', status: 'active', peers }));
  writeFileSync(join(root, 'tasks.json'), JSON.stringify(tasks));
  writeFileSync(join(root, 'yields.json'), JSON.stringify(yields));
  writeFileSync(join(root, 'mailbox.jsonl'), '');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
const readJson = (root, name) => JSON.parse(readFileSync(join(root, name), 'utf8'));
const task = (id, over = {}) => ({ id, write_set: [id.toLowerCase()], depends_on: [], status: 'pending', claimed_by: null, ...over });
const peer = (id, over = {}) => ({ peer_id: id, pclass: 'session', role: 'peer', workspace: '.', active: true, channel: 'sprint-pool', ...over });

// --- enqueue_task (AC-002) ---
test('test_when_enqueue_task_then_pending_task_appended', () => {
  const ch = mkChannel();
  try {
    const r = enqueueTask({ channelRoot: ch.root, sprint_id: 'lobby', task_id: 'P1', brief: 'do thing', write_set: ['x.mjs'], depends_on: [] });
    assert.equal(r.enqueued, true);
    assert.equal(r.task_id, 'P1');
    const t = readJson(ch.root, 'tasks.json').find((x) => x.id === 'P1');
    assert.equal(t.status, 'pending');
    assert.equal(t.origin, 'enqueue');
    assert.equal(t.brief, 'do thing');
  } finally { ch.cleanup(); }
});

test('test_when_enqueue_duplicate_task_id_then_rejected', () => {
  const ch = mkChannel({ tasks: [task('P1', { origin: 'enqueue' })] });
  try {
    const r = enqueueTask({ channelRoot: ch.root, sprint_id: 'lobby', task_id: 'P1', brief: 'again', write_set: [], depends_on: [] });
    assert.equal(r.enqueued, false);
    assert.match(String(r.reason), /duplicate/i);
    assert.equal(readJson(ch.root, 'tasks.json').filter((x) => x.id === 'P1').length, 1, 'no second task appended');
  } finally { ch.cleanup(); }
});

test('test_when_enqueue_task_with_traversal_id_then_rejected', () => {
  const ch = mkChannel();
  try {
    const r = enqueueTask({ channelRoot: ch.root, sprint_id: 'lobby', task_id: '../evil', brief: 'x', write_set: [], depends_on: [] });
    assert.equal(r.enqueued, false);
    assert.match(String(r.error), /invalid/i, 'traversal task_id rejected before any write');
    assert.equal(readJson(ch.root, 'tasks.json').length, 0, 'nothing written');
  } finally { ch.cleanup(); }
});

// --- registrar / auto-join (AC-001, AC-007) ---
test('test_when_registrar_runs_with_sprint_mode_on_then_peer_written', () => {
  const ch = mkChannel();
  try {
    const r = registerPoolPeer({ channelRoot: ch.root, sprint_id: 'lobby', peer_id: 'peer-1', role: 'peer', workspace: '.', sprintModeEnabled: true });
    assert.equal(r.registered, true);
    const p = readJson(ch.root, 'sprint.json').peers.find((x) => x.peer_id === 'peer-1');
    assert.equal(p.pclass, 'session');
    assert.equal(p.active, true);
    assert.equal(p.channel, 'sprint-pool');
  } finally { ch.cleanup(); }
});

test('test_when_registrar_runs_with_sprint_mode_off_then_refuses', () => {
  const ch = mkChannel();
  try {
    const r = registerPoolPeer({ channelRoot: ch.root, sprint_id: 'lobby', peer_id: 'peer-1', role: 'peer', workspace: '.', sprintModeEnabled: false });
    assert.equal(r.registered, false);
    assert.match(String(r.reason), /sprint.?mode|disabled|off/i);
    assert.equal((readJson(ch.root, 'sprint.json').peers || []).length, 0, 'no peer written when sprint_mode off');
  } finally { ch.cleanup(); }
});

// --- leave_peer (AC-006) ---
test('test_when_leave_peer_then_marked_inactive', () => {
  const ch = mkChannel({ peers: [peer('peer-1')] });
  try {
    const r = leavePeer({ channelRoot: ch.root, sprint_id: 'lobby', peer_id: 'peer-1' });
    assert.equal(r.ok, true);
    assert.equal(r.active, false);
    assert.equal(readJson(ch.root, 'sprint.json').peers.find((x) => x.peer_id === 'peer-1').active, false);
  } finally { ch.cleanup(); }
});

test('test_when_leave_peer_already_inactive_then_ok_idempotent', () => {
  const ch = mkChannel({ peers: [peer('peer-1', { active: false })] });
  try {
    const r = leavePeer({ channelRoot: ch.root, sprint_id: 'lobby', peer_id: 'peer-1' });
    assert.equal(r.ok, true, 'idempotent on already-inactive');
  } finally { ch.cleanup(); }
});

test('test_when_leave_peer_unknown_then_error', () => {
  const ch = mkChannel({ peers: [] });
  try {
    const r = leavePeer({ channelRoot: ch.root, sprint_id: 'lobby', peer_id: 'ghost' });
    assert.equal(r.ok, false);
    assert.match(String(r.error), /unknown/i);
  } finally { ch.cleanup(); }
});

// --- release / re-dispatch (AC-005) ---
test('test_when_release_task_then_pending_and_claimable', () => {
  const ch = mkChannel({ tasks: [task('P1', { status: 'claimed', claimed_by: 'peer-2', origin: 'enqueue' })] });
  try {
    const r = releaseTask({ channelRoot: ch.root, sprint_id: 'lobby', task_id: 'P1', brief: 'exact content now' });
    assert.equal(r.released, true);
    const t = readJson(ch.root, 'tasks.json').find((x) => x.id === 'P1');
    assert.equal(t.status, 'pending');
    assert.equal(t.claimed_by, null);
    assert.equal(t.brief, 'exact content now', 'updated brief applied');
  } finally { ch.cleanup(); }
});

// --- exactly-once claim through the re-dispatch path (AC-003 + AC-005) ---
test('test_when_two_peers_claim_released_task_then_exactly_one_wins', () => {
  const ch = mkChannel({ tasks: [task('P1', { status: 'claimed', claimed_by: 'peer-2', origin: 'enqueue' })] });
  try {
    releaseTask({ channelRoot: ch.root, sprint_id: 'lobby', task_id: 'P1', brief: 'exact content' });
    const a = claimTask({ channelRoot: ch.root, sprint_id: 'lobby', peer_id: 'peer-2', task_id: 'P1' });
    const b = claimTask({ channelRoot: ch.root, sprint_id: 'lobby', peer_id: 'peer-3', task_id: 'P1' });
    assert.equal([a, b].filter((r) => r.claimed === true).length, 1, 'AC-003: exactly one peer re-claims the released task');
  } finally { ch.cleanup(); }
});

// --- Security: traversal id on leave_peer (CWE-22 parity with baseline) ---
import { existsSync } from 'node:fs';
test('test_when_leave_peer_with_traversal_id_then_rejected', () => {
  const ch = mkChannel({ peers: [peer('peer-1')] });
  try {
    const evil = `../evil-${basename(ch.root)}`;
    const r = leavePeer({ channelRoot: ch.root, sprint_id: 'lobby', peer_id: evil });
    assert.equal(r.ok, false);
    assert.match(String(r.error), /invalid/i);
    assert.equal(existsSync(join(dirname(ch.root), `evil-${basename(ch.root)}`)), false, 'no escape from channelRoot');
  } finally { ch.cleanup(); }
});
