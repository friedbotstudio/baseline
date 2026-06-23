import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Modules under test do not exist yet — each test dynamically imports so the file
// loads and every case fails RED with a clear "Cannot find module" until /implement
// writes them. Real UDS sockets + real temp dirs + real baseline handlers — no mocks
// (Art VI.3): the socket and filesystem ARE the system under test.
const mod = (m) => import(new URL(`../.claude/mcp/sprint-broker/${m}`, import.meta.url));

// --- Foundation: real fixtures + awaitable socket lifecycle ---
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let sockCounter = 0;
const nextSock = () => join(tmpdir(), `spb-${process.pid}-${sockCounter++}.sock`);

function mkChannel({ tasks = [], yields = [], peers = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'spb-ch-'));
  writeFileSync(join(root, 'sprint.json'), JSON.stringify({ sprint_id: 'lobby', status: 'active', peers }));
  writeFileSync(join(root, 'tasks.json'), JSON.stringify(tasks));
  writeFileSync(join(root, 'yields.json'), JSON.stringify(yields));
  writeFileSync(join(root, 'mailbox.jsonl'), '');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

async function waitFor(pred, { timeout = 2000, step = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await pred()) return true;
    await delay(step);
  }
  throw new Error('waitFor timed out');
}

// Brings up a real broker + N clients on one socket, runs body, tears everything down.
async function withBroker({ channel = {}, clients = 0 }, body) {
  const { createBroker } = await mod('broker.mjs');
  const { createClient } = await mod('client.mjs');
  const ch = mkChannel(channel);
  const sockPath = nextSock();
  const broker = createBroker({ channelRoot: ch.root, sockPath });
  const conns = [];
  try {
    await broker.listen();
    for (let i = 0; i < clients; i++) {
      const events = [];
      const client = createClient({ sockPath, onEvent: (e) => events.push(e) });
      conns.push({ client, events });
    }
    await body({ broker, conns, channelRoot: ch.root, sockPath });
  } finally {
    for (const c of conns) { try { await c.client.close(); } catch { /* already closed */ } }
    try { await broker.close(); } catch { /* already closed */ }
    ch.cleanup();
  }
}

// =====================================================================
// Codec — NDJSON framing (AC-004)
// =====================================================================
test('test_when_encodeFrame_then_single_line_terminated', async () => {
  const { encodeFrame } = await mod('codec.mjs');
  const line = encodeFrame({ op: 'a', payload: { s: 'a\nb' } });
  assert.equal(line.endsWith('\n'), true);
  assert.equal(line.indexOf('\n'), line.length - 1, 'only the terminating newline is raw; payload newline is JSON-escaped');
  assert.deepEqual(JSON.parse(line), { op: 'a', payload: { s: 'a\nb' } });
});

test('test_when_codec_decodes_split_and_multiframe_chunk_then_reassembles_each', async () => {
  const { createDecoder } = await mod('codec.mjs');
  const frames = [];
  const dec = createDecoder({ onFrame: (f) => frames.push(f), onError: () => {} });
  dec.push('{"op":"a"}\n{"op":');
  dec.push('"b"}\n{"op":"c"}\n');
  assert.deepEqual(frames, [{ op: 'a' }, { op: 'b' }, { op: 'c' }]);
});

test('test_when_codec_receives_over_cap_line_then_rejects_via_onError', async () => {
  const { createDecoder } = await mod('codec.mjs');
  const frames = [];
  const errors = [];
  const dec = createDecoder({ onFrame: (f) => frames.push(f), onError: (e) => errors.push(e), maxLineLen: 16 });
  dec.push('this-line-is-definitely-way-too-long-to-accept\n');
  assert.equal(frames.length, 0, 'over-cap line is not delivered as a frame');
  assert.equal(errors.length >= 1, true, 'over-cap line triggers onError');
});

test('test_when_codec_receives_malformed_json_line_then_onError_and_keeps_parsing', async () => {
  const { createDecoder } = await mod('codec.mjs');
  const frames = [];
  const errors = [];
  const dec = createDecoder({ onFrame: (f) => frames.push(f), onError: (e) => errors.push(e) });
  dec.push('notjson\n{"op":"x"}\n');
  assert.equal(errors.length, 1, 'malformed line fires onError exactly once');
  assert.deepEqual(frames, [{ op: 'x' }], 'decoder keeps parsing the next valid frame (no tear)');
});

// =====================================================================
// Socket-path discovery (AC-006)
// =====================================================================
test('test_when_resolve_sock_path_env_set_then_env_wins', async () => {
  const { resolveSockPath } = await mod('sock-path.mjs');
  assert.equal(resolveSockPath({ env: { SPRINT_BROKER_SOCK: '/tmp/explicit.sock' }, channel: 'lobby' }), '/tmp/explicit.sock');
});

test('test_when_resolve_sock_path_unset_then_xdg_tmp_fallback', async () => {
  const { resolveSockPath } = await mod('sock-path.mjs');
  assert.equal(resolveSockPath({ env: { XDG_RUNTIME_DIR: '/run/u' }, channel: 'lobby' }), '/run/u/sprint-broker-lobby.sock');
  assert.equal(resolveSockPath({ env: { TMPDIR: '/tmp' }, channel: 'lobby' }), '/tmp/sprint-broker-lobby.sock');
  assert.equal(resolveSockPath({ env: {}, channel: 'lobby' }), '/tmp/sprint-broker-lobby.sock');
});

test('test_when_resolve_sock_path_over_length_then_throws', async () => {
  const { resolveSockPath } = await mod('sock-path.mjs');
  const longDir = `/${'x'.repeat(120)}`;
  assert.throws(() => resolveSockPath({ env: { XDG_RUNTIME_DIR: longDir }, channel: 'lobby' }), /length|too long/i);
});

// =====================================================================
// atomic-store — durability (AC-003)
// =====================================================================
test('test_when_atomic_persist_then_tempfile_renamed_never_partial', async () => {
  const { atomicPersist } = await mod('atomic-store.mjs');
  const ch = mkChannel();
  try {
    atomicPersist(ch.root, { tasks: [{ id: 'T1', status: 'pending' }] });
    const leftover = readdirSync(ch.root).filter((f) => f.includes('.tmp'));
    assert.equal(leftover.length, 0, 'no temp file left behind after rename');
    assert.deepEqual(JSON.parse(readFileSync(join(ch.root, 'tasks.json'), 'utf8')), [{ id: 'T1', status: 'pending' }]);
  } finally { ch.cleanup(); }
});

test('test_when_broker_restarts_then_recovers_tasks_and_yields', async () => {
  await withBroker({ channel: { tasks: [{ id: 'T1', status: 'pending', depends_on: [] }], yields: [{ task_id: 'T1', peer_id: 'p', fork_desc: 'x', status: 'open' }] } }, async ({ broker }) => {
    assert.equal(broker.state.tasks.some((t) => t.id === 'T1'), true, 'broker recovered prior tasks from the file log on boot');
    assert.equal(broker.state.yields.some((y) => y.task_id === 'T1'), true, 'broker recovered prior yields on boot');
  });
});

// =====================================================================
// Broker over a real socket (AC-001, AC-002, AC-005)
// =====================================================================
test('test_when_lead_enqueues_then_peer_client_in_other_cwd_receives_and_claims_single_winner', async () => {
  await withBroker({ clients: 1 }, async ({ broker, conns }) => {
    const { client, events } = conns[0];
    await client.call('register', { peer_id: 'p1', role: 'peer' });
    broker.enqueue({ id: 'T1', brief: 'do', write_set: [], depends_on: [] });
    await waitFor(() => events.some((e) => e.op === 'task-available' && e.payload?.task_id === 'T1'));
    const ack = await client.call('claim', { peer_id: 'p1', task_id: 'T1' });
    assert.equal(ack.claimed, true, 'peer claims the task delivered over the socket (no shared tasks.json)');
  });
});

test('test_when_two_clients_race_claim_then_exactly_one_wins', async () => {
  await withBroker({ clients: 2 }, async ({ broker, conns }) => {
    await conns[0].client.call('register', { peer_id: 'p1', role: 'peer' });
    await conns[1].client.call('register', { peer_id: 'p2', role: 'peer' });
    broker.enqueue({ id: 'T1', brief: 'do', write_set: [], depends_on: [] });
    const [a, b] = await Promise.all([
      conns[0].client.call('claim', { peer_id: 'p1', task_id: 'T1' }),
      conns[1].client.call('claim', { peer_id: 'p2', task_id: 'T1' }),
    ]);
    assert.equal([a, b].filter((r) => r.claimed === true).length, 1, 'exactly one client wins the claim');
  });
});

test('test_when_signal_done_then_dependents_unblocked', async () => {
  await withBroker({ clients: 1 }, async ({ broker, conns }) => {
    const { client } = conns[0];
    await client.call('register', { peer_id: 'p1', role: 'peer' });
    broker.enqueue({ id: 'T1', brief: 'a', write_set: [], depends_on: [] });
    broker.enqueue({ id: 'T2', brief: 'b', write_set: [], depends_on: ['T1'] });
    await client.call('claim', { peer_id: 'p1', task_id: 'T1' });
    const done = await client.call('signal_done', { peer_id: 'p1', task_id: 'T1' });
    assert.equal((done.unblocked || []).includes('T2'), true, 'signal_done unblocks dependents');
  });
});

test('test_when_peer_yields_and_lead_releases_then_idle_peer_receives_redispatch', async () => {
  await withBroker({ clients: 2 }, async ({ broker, conns }) => {
    const worker = conns[0];
    const idle = conns[1];
    await worker.client.call('register', { peer_id: 'p1', role: 'peer' });
    await idle.client.call('register', { peer_id: 'p2', role: 'peer' });
    broker.enqueue({ id: 'T1', brief: 'fuzzy', write_set: [], depends_on: [] });
    await worker.client.call('claim', { peer_id: 'p1', task_id: 'T1' });
    await worker.client.call('yield', { peer_id: 'p1', task_id: 'T1', fork_desc: 'undecidable' });
    idle.events.length = 0;
    broker.release('T1', 'concrete brief now');
    await waitFor(() => idle.events.filter((e) => e.op === 'task-available' && e.payload?.task_id === 'T1').length === 1);
    assert.equal(idle.events.filter((e) => e.op === 'task-available' && e.payload?.task_id === 'T1').length, 1, 're-dispatch is one pushed event, no suppression');
  });
});

test('test_when_peer_yields_then_broker_fires_host_onEvent', async () => {
  const { createBroker } = await mod('broker.mjs');
  const { createClient } = await mod('client.mjs');
  const ch = mkChannel();
  const sockPath = nextSock();
  const hostEvents = [];
  const broker = createBroker({ channelRoot: ch.root, sockPath, onEvent: (e) => hostEvents.push(e) });
  let client;
  try {
    await broker.listen();
    client = createClient({ sockPath, onEvent: () => {} });
    await client.call('register', { peer_id: 'p1', role: 'peer' });
    broker.enqueue({ id: 'T1', brief: 'x', write_set: [], depends_on: [] });
    await client.call('claim', { peer_id: 'p1', task_id: 'T1' });
    await client.call('yield', { peer_id: 'p1', task_id: 'T1', fork_desc: 'undecidable' });
    await waitFor(() => hostEvents.some((e) => e.op === 'yield' && e.payload?.task_id === 'T1'));
    assert.equal(hostEvents.filter((e) => e.op === 'yield' && e.payload?.task_id === 'T1').length, 1, 'broker fires a host-side yield event so the lead session can arbitrate');
  } finally {
    if (client) await client.close();
    await broker.close();
    ch.cleanup();
  }
});

test('test_when_peer_claims_and_finishes_then_broker_fires_host_lifecycle_events', async () => {
  const { createBroker } = await mod('broker.mjs');
  const { createClient } = await mod('client.mjs');
  const ch = mkChannel();
  const sockPath = nextSock();
  const hostEvents = [];
  const broker = createBroker({ channelRoot: ch.root, sockPath, onEvent: (e) => hostEvents.push(e) });
  let client;
  try {
    await broker.listen();
    client = createClient({ sockPath, onEvent: () => {} });
    await client.call('register', { peer_id: 'p1', role: 'peer' });
    broker.enqueue({ id: 'T1', brief: 'x', write_set: [], depends_on: [] });
    await client.call('claim', { peer_id: 'p1', task_id: 'T1' });
    await waitFor(() => hostEvents.some((e) => e.op === 'task-claimed' && e.payload?.task_id === 'T1'));
    await client.call('signal_done', { peer_id: 'p1', task_id: 'T1' });
    await waitFor(() => hostEvents.some((e) => e.op === 'task-done' && e.payload?.task_id === 'T1'));
    const done = hostEvents.find((e) => e.op === 'task-done' && e.payload?.task_id === 'T1');
    assert.equal(done.payload.peer_id, 'p1', 'lead is told who finished the task');
    assert.ok(Array.isArray(done.payload.unblocked), 'lead receives the unblocked-dependents list');
  } finally {
    if (client) await client.close();
    await broker.close();
    ch.cleanup();
  }
});

test('test_when_status_op_then_returns_authoritative_state', async () => {
  await withBroker({ clients: 1 }, async ({ broker, conns }) => {
    const { client } = conns[0];
    await client.call('register', { peer_id: 'p1', role: 'peer' });
    broker.enqueue({ id: 'T1', brief: 'x', write_set: [], depends_on: [] });
    await client.call('claim', { peer_id: 'p1', task_id: 'T1' });
    await client.call('signal_done', { peer_id: 'p1', task_id: 'T1' });
    // A status pull must reflect the done task even if push events were lost in transit.
    const status = await client.call('status', {});
    const t1 = status.tasks.find((t) => t.id === 'T1');
    assert.equal(t1.status, 'done', 'status pull returns authoritative task state (reconcile despite lossy push)');
    assert.equal(status.peers.some((p) => p.peer_id === 'p1'), true, 'status includes peers');
    assert.ok(Array.isArray(status.yields), 'status includes yields');
  });
});

test('test_when_release_then_matching_open_yield_resolved', async () => {
  await withBroker({ channel: { tasks: [{ id: 'T1', status: 'claimed', claimed_by: 'p1', depends_on: [] }], yields: [{ task_id: 'T1', peer_id: 'p1', fork_desc: 'x', status: 'open' }] } }, async ({ broker }) => {
    broker.release('T1', 'new brief');
    const y = broker.state.yields.find((z) => z.task_id === 'T1');
    assert.equal(y.status, 'resolved', 'release flips the matching open yield to resolved (preserved fix)');
  });
});

test('test_when_peer_disconnects_then_marked_inactive', async () => {
  await withBroker({ clients: 1 }, async ({ broker, conns }) => {
    await conns[0].client.call('register', { peer_id: 'p1', role: 'peer' });
    await conns[0].client.close();
    await waitFor(() => broker.state.peers.find((p) => p.peer_id === 'p1')?.active === false);
    assert.equal(broker.state.peers.find((p) => p.peer_id === 'p1').active, false, 'disconnect marks the peer inactive');
  });
});

test('test_when_frame_op_is_prototype_key_then_error_ack_no_crash', async () => {
  await withBroker({ clients: 1 }, async ({ conns }) => {
    const { client } = conns[0];
    const ack = await client.call('__proto__', {});
    assert.equal(typeof ack.error, 'string', 'a prototype-chain op yields an error ack, not a crash');
    const reg = await client.call('register', { peer_id: 'p1', role: 'peer' });
    assert.equal(reg.registered, true, 'broker survives the crafted frame and still serves valid ops');
  });
});

test('test_when_peer_reconnects_then_no_duplicate_state', async () => {
  const { createClient } = await mod('client.mjs');
  await withBroker({ clients: 1 }, async ({ broker, conns, sockPath }) => {
    await conns[0].client.call('register', { peer_id: 'p1', role: 'peer' });
    await conns[0].client.close();
    await waitFor(() => broker.state.peers.find((p) => p.peer_id === 'p1')?.active === false);
    const reconnect = createClient({ sockPath, onEvent: () => {} });
    try {
      await reconnect.call('register', { peer_id: 'p1', role: 'peer' });
      assert.equal(broker.state.peers.filter((p) => p.peer_id === 'p1').length, 1, 'reconnect upserts — no duplicate peer record');
      assert.equal(broker.state.peers.find((p) => p.peer_id === 'p1').active, true, 'reconnected peer is active again');
    } finally { await reconnect.close(); }
  });
});
