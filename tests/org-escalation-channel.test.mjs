import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// org-team-charter — free-form peer→lead→human escalation channel (AC-004, AC-009).
// Modules under test gain NEW ops/methods that do not exist yet — the message op,
// the answer host method, status.messages, and atomic-store.readMessages — so each
// case fails RED until /implement adds them. Real UDS sockets + real temp dirs, no
// mocks (Art VI.3): the socket and filesystem ARE the system under test.
const mod = (m) => import(new URL(`../.claude/mcp/sprint-broker/${m}`, import.meta.url));

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let sockCounter = 0;
const nextSock = () => join(tmpdir(), `org-${process.pid}-${sockCounter++}.sock`);

function mkChannel() {
  const root = mkdtempSync(join(tmpdir(), 'org-ch-'));
  writeFileSync(join(root, 'sprint.json'), JSON.stringify({ sprint_id: 'lobby', status: 'active', peers: [] }));
  writeFileSync(join(root, 'tasks.json'), JSON.stringify([]));
  writeFileSync(join(root, 'yields.json'), JSON.stringify([]));
  writeFileSync(join(root, 'mailbox.jsonl'), '');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

async function waitFor(pred, { timeout = 2000, step = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await pred()) return true; await delay(step); }
  throw new Error('waitFor timed out');
}

async function withBroker(body) {
  const { createBroker } = await mod('broker.mjs');
  const { createClient } = await mod('client.mjs');
  const ch = mkChannel();
  const sockPath = nextSock();
  const hostEvents = [];
  const broker = createBroker({ channelRoot: ch.root, sockPath, onEvent: (e) => hostEvents.push(e) });
  let client;
  try {
    await broker.listen();
    const peerEvents = [];
    client = createClient({ sockPath, onEvent: (e) => peerEvents.push(e) });
    await body({ broker, client, hostEvents, peerEvents, channelRoot: ch.root });
  } finally {
    if (client) { try { await client.close(); } catch { /* already closed */ } }
    try { await broker.close(); } catch { /* already closed */ }
    ch.cleanup();
  }
}

test('test_when_peer_calls_message_op_then_broker_persists_and_pushes_peer_message', async () => {
  await withBroker(async ({ broker, client, hostEvents, channelRoot }) => {
    await client.call('register', { peer_id: 'p1', role: 'peer' });
    const ack = await client.call('message', { peer_id: 'p1', kind: 'query', body: 'which lint config governs site-src?' });
    assert.equal(ack.ok, true, 'message op returns a structured ok ack');
    assert.equal(typeof ack.message_id, 'string', 'message op returns a message_id');
    await waitFor(() => hostEvents.some((e) => e.op === 'peer-message' && e.payload?.message_id === ack.message_id));
    const pushed = hostEvents.find((e) => e.op === 'peer-message' && e.payload?.message_id === ack.message_id);
    assert.equal(pushed.payload.from_peer, 'p1', 'lead is told which peer raised the query');
    assert.equal(pushed.payload.body, 'which lint config governs site-src?', 'free-form body reaches the lead');
    const persisted = JSON.parse(readFileSync(join(channelRoot, 'messages.json'), 'utf8'));
    assert.equal(persisted.some((m) => m.id === ack.message_id && m.status === 'open'), true, 'message persisted as open');
  });
});

test('test_when_lead_answers_then_answer_op_sets_message_answered_and_broadcasts', async () => {
  await withBroker(async ({ broker, client, peerEvents }) => {
    await client.call('register', { peer_id: 'p1', role: 'peer' });
    const ack = await client.call('message', { peer_id: 'p1', kind: 'query', body: 'q?' });
    const res = broker.answer(ack.message_id, 'use site-src/.eslintrc');
    assert.equal(res.ok, true, 'answer host method acks ok');
    await waitFor(() => peerEvents.some((e) => e.op === 'message-answered' && e.payload?.message_id === ack.message_id));
    const got = peerEvents.find((e) => e.op === 'message-answered' && e.payload?.message_id === ack.message_id);
    assert.equal(got.payload.answer, 'use site-src/.eslintrc', 'answer routed back to the peer');
    const status = await client.call('status', {});
    const m = status.messages.find((x) => x.id === ack.message_id);
    assert.equal(m.status, 'answered', 'status pull reflects the answered message (authoritative)');
  });
});

test('test_when_answer_unknown_message_then_structured_error_no_throw', async () => {
  await withBroker(async ({ broker }) => {
    const res = broker.answer('does-not-exist', 'x');
    assert.equal(res.error, 'unknown-message', 'answering an unknown message returns a structured error, not a throw');
  });
});

test('test_when_message_raised_while_lead_offline_then_queued_in_status_not_lost', async () => {
  // AC-009: undeliverable escalation must not be silently lost. The broker persists
  // the message and surfaces it via the authoritative status pull so the lead can
  // reconcile it later even if the live push event was dropped.
  await withBroker(async ({ client }) => {
    await client.call('register', { peer_id: 'p1', role: 'peer' });
    const ack = await client.call('message', { peer_id: 'p1', kind: 'escalation', body: 'human call: brand tone?' });
    const status = await client.call('status', {});
    assert.ok(Array.isArray(status.messages), 'status carries the messages list');
    const m = status.messages.find((x) => x.id === ack.message_id);
    assert.equal(m.status, 'open', 'the escalation is queued (open), not lost');
    assert.equal(m.kind, 'escalation', 'escalation kind preserved for the human-escalation path');
  });
});

test('test_when_readMessages_then_returns_persisted_messages', async () => {
  const { readMessages } = await mod('atomic-store.mjs');
  const ch = mkChannel();
  try {
    writeFileSync(join(ch.root, 'messages.json'), JSON.stringify([{ id: 'M1', from_peer: 'p1', to: 'lead', kind: 'query', body: 'b', status: 'open', answer: null }]));
    const msgs = readMessages(ch.root);
    assert.deepEqual(msgs.map((m) => m.id), ['M1'], 'readMessages returns the persisted message records');
  } finally { ch.cleanup(); }
});

test('test_when_readMessages_on_missing_file_then_empty', async () => {
  const { readMessages } = await mod('atomic-store.mjs');
  const ch = mkChannel();
  try {
    assert.deepEqual(readMessages(ch.root), [], 'a channel with no messages.json reads as an empty list (no throw)');
  } finally { ch.cleanup(); }
});

test('test_when_last_lane_done_then_broker_notifies_lead_all_done', async () => {
  // org-dogfood-1: the lead must get an unambiguous completion signal, not just lossy
  // per-task pushes. The broker fires all-done only when the LAST lane drains.
  await withBroker(async ({ broker, client, hostEvents }) => {
    await client.call('register', { peer_id: 'p1', role: 'peer' });
    broker.enqueue({ id: 'A', brief: '', write_set: [], depends_on: [] });
    broker.enqueue({ id: 'B', brief: '', write_set: [], depends_on: [] });
    await client.call('claim', { peer_id: 'p1', task_id: 'A' });
    await client.call('signal_done', { peer_id: 'p1', task_id: 'A' });
    await waitFor(() => hostEvents.some((e) => e.op === 'task-done' && e.payload?.task_id === 'A'));
    assert.equal(hostEvents.some((e) => e.op === 'all-done'), false, 'no all-done while a lane is still pending');
    await client.call('claim', { peer_id: 'p1', task_id: 'B' });
    await client.call('signal_done', { peer_id: 'p1', task_id: 'B' });
    await waitFor(() => hostEvents.some((e) => e.op === 'all-done'));
    assert.equal(hostEvents.some((e) => e.op === 'all-done'), true, 'the lead is notified when the last lane completes');
  });
});

test('test_when_status_pulled_then_all_done_flag_is_authoritative', async () => {
  // Reliable backstop for a dropped completion push: the lead can pull all_done.
  await withBroker(async ({ broker, client }) => {
    await client.call('register', { peer_id: 'p1', role: 'peer' });
    broker.enqueue({ id: 'A', brief: '', write_set: [], depends_on: [] });
    assert.equal((await client.call('status', {})).all_done, false, 'all_done is false while a lane is pending');
    await client.call('claim', { peer_id: 'p1', task_id: 'A' });
    await client.call('signal_done', { peer_id: 'p1', task_id: 'A' });
    assert.equal((await client.call('status', {})).all_done, true, 'all_done is true once every lane has drained (never dropped)');
  });
});
