// Domain: the native cross-session messaging accelerator.
//
// A peer learns a lane became claimable by polling `sprint_status`. That is the
// authoritative path and it stays authoritative. This module shortens the wait
// when the host can carry a message between sessions, and does nothing at all
// when it cannot. Nothing downstream may depend on a message arriving.
//
// Two rules make that safe. The probe fails closed, so an unreadable signal
// resolves to unavailable rather than to a hopeful yes. And every send is
// wrapped, so a host that refuses can never roll back the state transition that
// triggered it.
//
// What travels is a pointer: the channel, the lane and what happened to it. The
// channel store holds the one copy of task state; a message carrying a brief or
// a write_set would create a second copy, and the two would disagree the moment
// either moved. `composePointer` throws on a payload-bearing key rather than
// dropping it, because a caller that believes it sent a brief is worse off than
// one that got an error.

import { isSafeId } from './lib/safe-id.mjs';
export { probeNativeMessaging, MIN_HOST_VERSION } from './lib/host-probe.mjs';

// The delivery boundary is a Claude Code host affordance (ListAgents +
// SendMessage), not something an MCP stdio server can call. Callers inject a
// transport that owns that call; with none injected there is nothing to send on
// and the accelerator is inert, which is the sanctioned resting state.
const POINTER_EVENTS = Object.freeze(['claimable', 'done']);

const POINTER_KEYS = Object.freeze(['channel', 'task_id', 'event']);

/**
 * Build the message body. A pointer names a lane; it never carries one.
 *
 * Unknown keys throw rather than being ignored, which is what keeps the schema
 * closed: a caller cannot widen it by passing more.
 */
export function composePointer(fields) {
  if (!fields || typeof fields !== 'object') throw new Error('pointer requires channel, task_id and event');
  const extra = Object.keys(fields).filter((k) => !POINTER_KEYS.includes(k));
  if (extra.length > 0) {
    throw new Error(`a pointer carries no payload; refusing extra field(s): ${extra.join(', ')}`);
  }
  const { channel, task_id, event } = fields;
  if (!isSafeId(channel)) throw new Error(`invalid channel: ${String(channel)}`);
  if (!isSafeId(task_id)) throw new Error(`invalid task_id: ${String(task_id)}`);
  if (!POINTER_EVENTS.includes(event)) throw new Error(`invalid event: ${String(event)}`);
  return `channel ${channel}: task ${task_id} is ${event}. Reconcile with sprint_status.`;
}

/**
 * Send one pointer, or explain why none was sent. Never throws.
 *
 * The reason matters more than the boolean: a caller logging "not sent" wants to
 * know whether the host is off, the lane has no assignee, or the send failed.
 */
export function notifyPointer({ transport, capability, channel, task_id, event, peer }) {
  if (!capability || capability.available !== true) {
    return { sent: false, reason: `native messaging unavailable: ${(capability && capability.reason) || 'not probed'}` };
  }
  if (!peer) return { sent: false, reason: 'no assignee to address the pointer to' };
  if (!transport || typeof transport.send !== 'function') {
    return { sent: false, reason: 'no transport injected' };
  }

  let body;
  try {
    body = composePointer({ channel, task_id, event });
  } catch (err) {
    return { sent: false, reason: `pointer refused: ${err.message}` };
  }

  try {
    const result = transport.send(peer, body);
    const delivery = result && typeof result.delivery === 'string' ? result.delivery : 'unknown';
    return { sent: delivery === 'delivered', reason: `delivery ${delivery}` };
  } catch (err) {
    // A host that refuses must not disturb the transition that called us.
    return { sent: false, reason: `transport failed: ${err.message}` };
  }
}

/**
 * Point every named peer at a lane that just became claimable. Used by the
 * handlers, which pass their `notify` block straight through; with no block the
 * call is a no-op and behaviour is exactly as it was before this module existed.
 */
export function notifyClaimable(notify, tasks) {
  if (!notify || !Array.isArray(tasks) || tasks.length === 0) return [];
  const { transport, capability, channel } = notify;
  return tasks
    .filter((t) => t && t.assignee)
    .map((t) => notifyPointer({ transport, capability, channel, task_id: t.id, event: 'claimable', peer: t.assignee }));
}
