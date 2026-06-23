import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// org-dogfood-1 security regression (CWE-400 / CWE-667 availability + integrity):
// a second broker on an OCCUPIED channel socket must REFUSE rather than unlink the
// socket and take it over. A silent takeover splits the pod (the original lead + peers
// keep talking to a hijacked socket with fresh, empty state). The legitimate need the
// old unlink served — recovering a STALE socket left by a crashed broker — is preserved:
// a probe distinguishes a live listener (refuse) from a dead one (reclaim).
// Real UDS sockets + temp dirs, no mocks (Art VI.3).

const mod = (m) => import(new URL(`../.claude/mcp/sprint-broker/${m}`, import.meta.url));
let n = 0;
const nextSock = () => join(tmpdir(), `org-hj-${process.pid}-${n++}.sock`);

function mkChannel() {
  const root = mkdtempSync(join(tmpdir(), 'org-hj-ch-'));
  writeFileSync(join(root, 'sprint.json'), JSON.stringify({ sprint_id: 'lobby', status: 'active', peers: [] }));
  writeFileSync(join(root, 'tasks.json'), '[]');
  writeFileSync(join(root, 'yields.json'), '[]');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('test_when_second_broker_on_live_socket_then_refuses_takeover', async () => {
  const { createBroker } = await mod('broker.mjs');
  const { createClient } = await mod('client.mjs');
  const ch1 = mkChannel();
  const ch2 = mkChannel();
  const sock = nextSock();
  const b1 = createBroker({ channelRoot: ch1.root, sockPath: sock });
  await b1.listen();
  const b2 = createBroker({ channelRoot: ch2.root, sockPath: sock });
  let client;
  try {
    await assert.rejects(() => b2.listen(), /refus|already listening|in use/i, 'a second broker on a live socket refuses to take over');
    // The original broker still owns the socket: a client connects and registers.
    client = createClient({ sockPath: sock, onEvent: () => {} });
    const r = await client.call('register', { peer_id: 'p1', role: 'peer' });
    assert.equal(r.registered, true, 'the original broker still serves clients (no hijack)');
  } finally {
    if (client) { try { await client.close(); } catch { /* closed */ } }
    try { await b2.close(); } catch { /* never listened */ }
    await b1.close();
    ch1.cleanup();
    ch2.cleanup();
  }
});

test('test_when_socket_is_stale_then_new_broker_recovers', async () => {
  const { createBroker } = await mod('broker.mjs');
  const { createClient } = await mod('client.mjs');
  const ch = mkChannel();
  const sock = nextSock();
  writeFileSync(sock, ''); // stale leftover at the path, no live listener
  const b = createBroker({ channelRoot: ch.root, sockPath: sock });
  let client;
  try {
    await b.listen(); // must reclaim the stale path and listen, not reject
    client = createClient({ sockPath: sock, onEvent: () => {} });
    assert.equal((await client.call('register', { peer_id: 'p1', role: 'peer' })).registered, true, 'a broker reclaims a stale socket and serves');
  } finally {
    if (client) { try { await client.close(); } catch { /* closed */ } }
    await b.close();
    ch.cleanup();
  }
});
