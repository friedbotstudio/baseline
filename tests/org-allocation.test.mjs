import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// org-team-charter dogfood regressions (Article X):
//  - directed allocation: the lead can target a task at a named peer (assignee);
//    a non-assignee claim is rejected; claim-any (no assignee) is unchanged.
//  - sprint-independence: the pool registers peers under org_mode OR sprint_mode,
//    not only sprint_mode (peers get tasks without a sprint in place).
//  - role-identity: a peer session gets peer-scoped instructions and never adopts
//    the lead role (the bug where peer-2 declined a claimable lane "because it is lead").
// Real fixtures, no mocks (Art VI.3).

function mkChannel({ tasks = [], peers = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'org-alloc-'));
  writeFileSync(join(root, 'sprint.json'), JSON.stringify({ sprint_id: 'lobby', status: 'active', peers }));
  writeFileSync(join(root, 'tasks.json'), JSON.stringify(tasks));
  writeFileSync(join(root, 'yields.json'), JSON.stringify([]));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// --- directed allocation (assignee) -------------------------------------------

test('test_when_task_assigned_then_only_assignee_can_claim', async () => {
  const { claimTask } = await import('../.claude/mcp/sprint-channel/handlers.mjs');
  const ch = mkChannel({ tasks: [{ id: 'T1', status: 'pending', depends_on: [], assignee: 'peer-1' }] });
  try {
    const wrong = claimTask({ channelRoot: ch.root, peer_id: 'peer-2', task_id: 'T1' });
    assert.equal(wrong.claimed, false, 'a non-assignee cannot claim a directed task');
    assert.match(wrong.reason, /assigned to peer-1/i, 'rejection names the assignee');
    const right = claimTask({ channelRoot: ch.root, peer_id: 'peer-1', task_id: 'T1' });
    assert.equal(right.claimed, true, 'the named assignee claims its directed task');
  } finally { ch.cleanup(); }
});

test('test_when_task_has_no_assignee_then_claim_any_unchanged', async () => {
  const { claimTask } = await import('../.claude/mcp/sprint-channel/handlers.mjs');
  const ch = mkChannel({ tasks: [{ id: 'T1', status: 'pending', depends_on: [] }] });
  try {
    const r = claimTask({ channelRoot: ch.root, peer_id: 'peer-2', task_id: 'T1' });
    assert.equal(r.claimed, true, 'an unassigned task is claim-any (first free wins)');
  } finally { ch.cleanup(); }
});

test('test_when_enqueue_with_assignee_then_task_carries_it', async () => {
  const { enqueueTask } = await import('../.claude/mcp/sprint-pool/handlers.mjs');
  const { readTasks } = await import('../.claude/mcp/sprint-channel/lib/store.mjs');
  const ch = mkChannel();
  try {
    const r = enqueueTask({ channelRoot: ch.root, task_id: 'T1', brief: 'x', assignee: 'peer-2' });
    assert.equal(r.enqueued, true);
    const t = readTasks(ch.root).find((x) => x.id === 'T1');
    assert.equal(t.assignee, 'peer-2', 'enqueued task records the assignee');
  } finally { ch.cleanup(); }
});

// --- sprint-independence: org_mode enables the pool ---------------------------

test('test_when_org_mode_enabled_then_pool_registers_without_sprint', async () => {
  const { registerPoolPeer } = await import('../.claude/mcp/sprint-pool/handlers.mjs');
  const ch = mkChannel();
  try {
    const ok = registerPoolPeer({ channelRoot: ch.root, peer_id: 'peer-1', role: 'peer', poolEnabled: true });
    assert.equal(ok.registered, true, 'a peer registers when pool coordination is enabled (org mode), no sprint required');
    const off = registerPoolPeer({ channelRoot: ch.root, peer_id: 'peer-2', role: 'peer', poolEnabled: false });
    assert.equal(off.registered, false, 'registration refused when neither org_mode nor sprint_mode is on');
  } finally { ch.cleanup(); }
});

test('test_when_legacy_sprintModeEnabled_passed_then_still_gates', async () => {
  const { registerPoolPeer } = await import('../.claude/mcp/sprint-pool/handlers.mjs');
  const ch = mkChannel();
  try {
    // back-compat: callers passing the old sprintModeEnabled gate still work.
    assert.equal(registerPoolPeer({ channelRoot: ch.root, peer_id: 'p', role: 'peer', sprintModeEnabled: true }).registered, true);
    assert.equal(registerPoolPeer({ channelRoot: ch.root, peer_id: 'q', role: 'peer', sprintModeEnabled: false }).registered, false);
  } finally { ch.cleanup(); }
});

// --- role-identity: peer never adopts the lead role ---------------------------

test('test_when_role_is_peer_then_instructions_are_peer_scoped', async () => {
  const { instructionsFor } = await import('../.claude/mcp/sprint-pool/server.mjs');
  const peer = instructionsFor('peer');
  const lead = instructionsFor('lead');
  assert.match(peer, /you are a (pool )?peer/i, 'peer instructions assert the peer role');
  assert.match(peer, /never arbitrate/i, 'peer instructions explicitly forbid arbitration (a lead-only duty)');
  assert.doesNotMatch(peer, /arbitrate in main context|then release_task/i, 'peer is not handed the lead positive directive');
  assert.match(lead, /arbitrate in main context/i, 'lead instructions retain the arbitration directive');
});

test('test_when_peer_id_given_then_instructions_state_its_identity', async () => {
  const { instructionsFor } = await import('../.claude/mcp/sprint-pool/server.mjs');
  const peer = instructionsFor('peer', 'peer-2');
  assert.match(peer, /peer-2/, 'a peer is told its own peer id, so it never guesses (e.g. assuming it is peer-1)');
  assert.match(peer, /no other peer|never assume another peer/i, 'the peer is bound to its own identity only');
  const lead = instructionsFor('lead', 'lead');
  assert.match(lead, /your id on this channel is `lead`/i, 'the lead is told its own id too');
});
