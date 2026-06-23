// Domain: the peer-side broker client. A peer's pool MCP server holds one client to
// the broker socket: it forwards tool calls (register/claim/signal_done/yield) and
// resolves each on the matching ack, and routes pushed events to onEvent (the pool
// server bridges those into notifications/claude/channel for its own session). A fresh
// client re-attaches after a disconnect — the broker's register is idempotent. node:net
// + Foundation codec only.

import { createConnection } from 'node:net';
import { encodeFrame, createDecoder } from './codec.mjs';

const CALL_TIMEOUT_MS = 2000;

export function createClient({ sockPath, onEvent }) {
  const pending = new Map();
  let nextId = 0;

  const socket = createConnection({ path: sockPath });
  socket.setEncoding('utf8');

  const decoder = createDecoder({
    onFrame: (frame) => {
      if (frame.kind === 'event') { onEvent(frame); return; }
      if (frame.kind === 'ack') {
        const waiter = pending.get(frame.id);
        if (waiter) { pending.delete(frame.id); waiter.resolve(frame); }
      }
    },
    onError: () => { /* malformed inbound frame — ignore; ack timeout guards the caller */ },
  });
  socket.on('data', (chunk) => decoder.push(chunk));
  socket.on('error', (err) => {
    for (const waiter of pending.values()) waiter.reject(err);
    pending.clear();
  });

  function call(op, args) {
    const id = `c${nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`call ${op} timed out`)); }, CALL_TIMEOUT_MS);
      pending.set(id, { resolve: (frame) => { clearTimeout(timer); resolve(frame); }, reject: (err) => { clearTimeout(timer); reject(err); } });
      socket.write(encodeFrame({ op, id, payload: args }));
    });
  }

  function close() {
    return new Promise((resolve) => {
      socket.end(resolve);
    });
  }

  return { call, close };
}
