// Domain: the in-process coordination broker. The lead session hosts ONE broker that
// is the sole writer of tasks/yields/peers and the single rendezvous all peer clients
// connect to over a Unix-domain socket. Coordination LOGIC is the reused baseline
// channel handlers (claim/done/yield/register) + the project-local pool handlers
// (enqueue/release) — only the TRANSPORT is new here. Delivery is event-native: a
// pending task is broadcast as a pushed frame, so the poll-watch loop and its
// re-notify-suppression bug class are gone. node:net + Foundation only.

import { createServer, createConnection } from 'node:net';
import { unlinkSync } from 'node:fs';
import { registerPeer, claimTask, signalDone, yieldFork } from '../sprint-channel/handlers.mjs';
import { enqueueTask, releaseTask } from '../sprint-pool/handlers.mjs';
import { encodeFrame, createDecoder } from './codec.mjs';
import { atomicPersist, readTasks, readYields, readSprint, readMessages } from './atomic-store.mjs';

export function createBroker({ channelRoot, sockPath, onEvent = () => {} }) {
  const state = {
    channelRoot,
    peers: (readSprint(channelRoot).peers || []).map((p) => ({ ...p, active: false })),
    tasks: readTasks(channelRoot),
    yields: readYields(channelRoot),
    messages: readMessages(channelRoot),
  };
  const sockets = new Set();
  const socketPeers = new Map();
  // Monotonic per-broker message id: pid + in-process counter is collision-free for a
  // single-machine broker without reading the clock.
  let messageSeq = state.messages.length;
  const newMessageId = () => `m-${process.pid}-${messageSeq++}`;
  const persistMessages = () => atomicPersist(channelRoot, { messages: state.messages });

  // lazy: baseline/pool handlers persist non-atomically; the broker re-persists the
  // refreshed slice via atomicPersist so the FINAL on-disk snapshot is crash-safe
  // (Decision 2). A double-write on tiny single-machine files; revisit only if write
  // volume ever matters.
  function refresh() {
    state.tasks = readTasks(channelRoot);
    state.yields = readYields(channelRoot);
    atomicPersist(channelRoot, { tasks: state.tasks, yields: state.yields });
  }

  function broadcast(event) {
    const frame = encodeFrame(event);
    for (const socket of sockets) socket.write(frame);
  }

  function markPeer(peer_id, role) {
    const existing = state.peers.find((p) => p.peer_id === peer_id);
    if (existing) { existing.active = true; if (role) existing.role = role; return existing; }
    const record = { peer_id, pclass: 'session', role: role || 'peer', active: true };
    state.peers.push(record);
    return record;
  }

  function handleRegister(payload, socket) {
    const { peer_id, role = 'peer', workspace = '.' } = payload;
    const result = registerPeer({ channelRoot, peer_id, pclass: 'session', role, workspace });
    if (result.ok) {
      markPeer(peer_id, role);
      socketPeers.get(socket).add(peer_id);
    }
    return result;
  }

  // The lead session is the broker's in-process owner, NOT a socket client, so peer
  // lifecycle (claim / done / yield) reaches it only through this host hook — never a
  // broadcast. Fire only on success so a lost claim race or a rejected op stays quiet.
  const OPS = {
    // Read-only reconcile: returns authoritative state so a caller can recover from a
    // dropped push event (events are hints; this is the truth). No mutation, no onEvent.
    status: () => ({
      tasks: state.tasks, yields: state.yields, peers: state.peers, messages: state.messages,
      // Authoritative, never-dropped completion flag: the lead reconciles via status
      // when it is waiting, so a lost task-done/all-done push can never strand it.
      all_done: state.tasks.length > 0 && state.tasks.every((t) => t.status === 'done'),
    }),
    register: handleRegister,
    // Free-form peer→lead query/escalation (org-team charter). Persist first so a
    // dropped push is still recoverable via status (never lost), then push to the lead.
    message: (payload) => {
      const { peer_id, kind = 'query', body = '' } = payload;
      const message_id = newMessageId();
      state.messages.push({ id: message_id, from_peer: peer_id, to: 'lead', kind, body, status: 'open', answer: null });
      persistMessages();
      onEvent({ kind: 'event', op: 'peer-message', payload: { message_id, from_peer: peer_id, kind, body } });
      return { ok: true, message_id };
    },
    claim: (payload) => {
      const r = claimTask({ channelRoot, ...payload });
      refresh();
      if (r.claimed) onEvent({ kind: 'event', op: 'task-claimed', payload: { task_id: payload.task_id, peer_id: payload.peer_id } });
      return r;
    },
    signal_done: (payload) => {
      const r = signalDone({ channelRoot, ...payload });
      refresh();
      if (r.ok) {
        onEvent({ kind: 'event', op: 'task-done', payload: { task_id: payload.task_id, peer_id: payload.peer_id, unblocked: r.unblocked || [] } });
        // Aggregate completion: when the last lane drains, give the lead an unambiguous
        // "all done" signal it can act on without polling (per-task pushes are lossy).
        if (state.tasks.length > 0 && state.tasks.every((t) => t.status === 'done')) {
          onEvent({ kind: 'event', op: 'all-done', payload: { count: state.tasks.length } });
        }
      }
      return r;
    },
    yield: (payload) => {
      const r = yieldFork({ channelRoot, ...payload });
      refresh();
      onEvent({ kind: 'event', op: 'yield', payload: { task_id: payload.task_id, peer_id: payload.peer_id, fork_desc: payload.fork_desc } });
      return r;
    },
  };

  function dispatch(frame, socket) {
    const { op, id, payload = {} } = frame;
    // Own-property lookup only: a crafted op like "__proto__" / "constructor" must NOT
    // reach an inherited Object.prototype member (CWE-471; would crash on a non-callable
    // or invoke an unintended one).
    const handler = Object.hasOwn(OPS, op) ? OPS[op] : null;
    const result = handler ? handler(payload, socket) : { error: `unknown op: ${op}` };
    socket.write(encodeFrame({ kind: 'ack', id, ...result }));
  }

  function onConnection(socket) {
    socket.setEncoding('utf8');
    sockets.add(socket);
    socketPeers.set(socket, new Set());
    const decoder = createDecoder({
      onFrame: (frame) => dispatch(frame, socket),
      onError: (err) => socket.write(encodeFrame({ kind: 'error', reason: err.message })),
    });
    socket.on('data', (chunk) => decoder.push(chunk));
    socket.on('close', () => {
      for (const peer_id of socketPeers.get(socket) || []) {
        const peer = state.peers.find((p) => p.peer_id === peer_id);
        if (peer) peer.active = false;
      }
      socketPeers.delete(socket);
      sockets.delete(socket);
    });
    socket.on('error', () => { /* connection reset — close handler does cleanup */ });
  }

  const server = createServer(onConnection);

  function listen() {
    return new Promise((resolve, reject) => {
      let retried = false;
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && !retried) {
          retried = true;
          // Probe before reclaiming: a LIVE broker answers the socket, so refuse to
          // hijack it (one lead per channel — a silent takeover would split the pod and
          // hand the new broker fresh, empty state). Only a STALE socket left by a
          // crashed broker (probe connection refused) is safe to unlink and reclaim.
          const probe = createConnection({ path: sockPath });
          probe.once('connect', () => {
            probe.destroy();
            reject(new Error(`a broker is already listening on ${sockPath}; refusing to take over (one lead per channel)`));
          });
          probe.once('error', () => {
            try { unlinkSync(sockPath); } catch { /* nothing to unlink */ }
            server.listen(sockPath);
          });
        } else { reject(err); }
      });
      server.once('listening', resolve);
      server.listen(sockPath);
    });
  }

  function close() {
    return new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      server.close(() => { try { unlinkSync(sockPath); } catch { /* already gone */ } resolve(); });
    });
  }

  function enqueue(task) {
    enqueueTask({ channelRoot, task_id: task.id, brief: task.brief, write_set: task.write_set, depends_on: task.depends_on, assignee: task.assignee ?? null });
    refresh();
    // Surface the assignee on the push so a well-behaved peer skips a lane that is not
    // its own; claimTask enforces it server-side regardless (the hard guarantee).
    broadcast({ kind: 'event', op: 'task-available', payload: { task_id: task.id, assignee: task.assignee ?? null } });
  }

  function release(task_id, brief) {
    releaseTask({ channelRoot, task_id, brief });
    refresh();
    broadcast({ kind: 'event', op: 'task-available', payload: { task_id } });
  }

  // The lead answers a peer's free-form message in its own main context, then routes
  // the resolution back to every peer (the originating peer de-dupes by message_id).
  function answer(message_id, answerBody) {
    const message = state.messages.find((m) => m.id === message_id);
    if (!message) return { error: 'unknown-message' };
    message.status = 'answered';
    message.answer = answerBody;
    persistMessages();
    broadcast({ kind: 'event', op: 'message-answered', payload: { message_id, answer: answerBody } });
    return { ok: true };
  }

  return { listen, close, enqueue, release, answer, state };
}
