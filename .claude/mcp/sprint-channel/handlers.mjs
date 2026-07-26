// Domain: the 9 channel tool handlers. Each takes {channelRoot, ...contractInput}
// and returns the contracted result object (see spec Slice B Contracts table).
// Composed from the Foundation primitives (store/lock/schema). No SDK import —
// the MCP stdio wrapper (server.mjs) is a separate, deferred concern.

import {
  readSprint, writeSprint, readTasks, writeTasks, readYields, writeYields, appendMailbox,
} from './lib/store.mjs';
import { withLock } from './lib/lock.mjs';
import { validateMessage } from './lib/schema.mjs';
import { isSafeId } from './lib/safe-id.mjs';

const findTask = (tasks, id) => tasks.find((t) => t.id === id);

export function registerPeer({ channelRoot, peer_id, pclass, role, workspace }) {
  if (!isSafeId(peer_id)) return { ok: false, error: 'invalid peer_id' };
  const sprint = readSprint(channelRoot);
  sprint.peers = sprint.peers || [];
  const record = { peer_id, pclass, role, workspace };
  const at = sprint.peers.findIndex((p) => p.peer_id === peer_id);
  if (at >= 0) sprint.peers[at] = record;
  else sprint.peers.push(record);
  writeSprint(channelRoot, sprint);
  return { ok: true, registered: true };
}

export function sendMessage({ channelRoot, from, to, type, payload }) {
  const check = validateMessage({ from, type });
  if (!check.valid) return { delivered: false, error: check.error };
  appendMailbox(channelRoot, { from, to, type, payload, ts: Date.now() });
  return { delivered: true };
}

export function broadcast({ channelRoot, from, type, payload }) {
  const check = validateMessage({ from, type });
  if (!check.valid) return { delivered_count: 0, error: check.error };
  const recipients = (readSprint(channelRoot).peers || []).filter((p) => p.peer_id !== from);
  appendMailbox(channelRoot, { from, to: 'all', type, payload, ts: Date.now() });
  return { delivered_count: recipients.length };
}

export function claimTask({ channelRoot, peer_id, task_id }) {
  if (!isSafeId(task_id) || !isSafeId(peer_id)) return { claimed: false, reason: 'invalid task_id or peer_id' };
  const tasks = readTasks(channelRoot);
  const target = findTask(tasks, task_id);
  if (!target) return { claimed: false, reason: 'unknown task' };
  if (target.status === 'claimed' && target.claimed_by === peer_id) return { claimed: true };
  // Directed allocation: a task may be targeted at a named peer. Only that peer may
  // claim it; every other peer is rejected even while it is pending (the lead's
  // allocation control). A task with no assignee stays claim-any.
  if (target.assignee && target.assignee !== peer_id) return { claimed: false, reason: `task ${task_id} is assigned to ${target.assignee}` };
  if (target.status !== 'pending') return { claimed: false, reason: `task ${task_id} is not claimable (status ${target.status})` };
  const unmet = (target.depends_on || []).filter((dep) => {
    const d = findTask(tasks, dep);
    return !d || d.status !== 'done';
  });
  if (unmet.length) return { claimed: false, reason: `unmet dependency: ${unmet.join(', ')}` };

  const lock = withLock(channelRoot, `task-${task_id}`, () => {
    const fresh = readTasks(channelRoot);
    const ft = findTask(fresh, task_id);
    if (!ft || ft.status !== 'pending') return false;
    ft.status = 'claimed';
    ft.claimed_by = peer_id;
    writeTasks(channelRoot, fresh);
    return true;
  });
  if (!lock.acquired) return { claimed: false, reason: 'task lock held by a concurrent claim' };
  return lock.result ? { claimed: true } : { claimed: false, reason: 'task already claimed' };
}

export function signalDone({ channelRoot, peer_id, task_id, commit_sha }) {
  if (!isSafeId(task_id) || !isSafeId(peer_id)) return { ok: false, error: 'invalid task_id or peer_id' };
  const tasks = readTasks(channelRoot);
  const target = findTask(tasks, task_id);
  if (!target) return { ok: false, error: 'unknown task' };
  if (target.claimed_by !== peer_id) return { ok: false, error: 'not claimer' };
  target.status = 'done';
  // The task shape carries commit_sha (default null); record it when the peer
  // supplies one so the lead can trace which commit closed the lane. Optional by
  // contract, so an absent value leaves the existing field untouched.
  if (typeof commit_sha === 'string' && commit_sha !== '') target.commit_sha = commit_sha;
  const done = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id));
  const unblocked = tasks
    .filter((t) => t.status === 'pending' && (t.depends_on || []).length > 0 && (t.depends_on || []).every((d) => done.has(d)))
    .map((t) => t.id);
  writeTasks(channelRoot, tasks);
  return { ok: true, unblocked };
}

export function raiseConflict({ channelRoot, peer_id, task_id, path }) {
  if (!isSafeId(task_id) || !isSafeId(peer_id)) return { ack: false, error: 'invalid task_id or peer_id' };
  const sprint = readSprint(channelRoot);
  sprint.conflicts = sprint.conflicts || [];
  if (!sprint.conflicts.some((c) => c.task_id === task_id && c.path === path)) {
    sprint.conflicts.push({ task_id, path, peer_id, ts: Date.now() });
    writeSprint(channelRoot, sprint);
  }
  return { ack: true, arbiter: 'lead' };
}

export function yieldFork({ channelRoot, peer_id, task_id, fork_desc }) {
  if (!isSafeId(task_id) || !isSafeId(peer_id)) return { recorded: false, error: 'invalid task_id or peer_id' };
  const yields = readYields(channelRoot);
  const plan_version = yields.reduce((max, y) => Math.max(max, y.plan_version || 0), 0) + 1;
  yields.push({ task_id, peer_id, fork_desc, plan_version, status: 'open' });
  writeYields(channelRoot, yields);
  return { recorded: true, plan_version };
}

// Lead-side re-dispatch. Resets a claimed/yielded task to pending, clears the
// claim, optionally swaps in a settled brief, and resolves the open yield — the
// clean path a yield needs, replacing hand-edits of tasks.json. A `done` task is
// never resurrected. Locked so a concurrent claim/release cannot interleave.
export function releaseTask({ channelRoot, task_id, brief }) {
  if (!isSafeId(task_id)) return { released: false, error: 'invalid task_id' };
  const lock = withLock(channelRoot, `release-${task_id}`, () => {
    const tasks = readTasks(channelRoot);
    const target = findTask(tasks, task_id);
    if (!target) return { released: false, reason: 'unknown task' };
    if (target.status === 'done') return { released: false, reason: 'task is done' };
    target.status = 'pending';
    target.claimed_by = null;
    if (brief !== undefined) target.brief = brief;
    writeTasks(channelRoot, tasks);
    const yields = readYields(channelRoot);
    const openYield = yields.find((y) => y.task_id === task_id && y.status === 'open');
    if (openYield) { openYield.status = 'resolved'; writeYields(channelRoot, yields); }
    return { released: true };
  });
  if (!lock.acquired) return { released: false, reason: 'release lock held by a concurrent call' };
  return lock.result;
}

// Deregister a peer: remove it from sprint.peers[] so a departed peer is no
// longer listed (registerPeer only adds/updates). Idempotent — leaving an absent
// peer reports removed:false rather than erroring.
export function leavePeer({ channelRoot, peer_id }) {
  if (!isSafeId(peer_id)) return { ok: false, error: 'invalid peer_id' };
  const sprint = readSprint(channelRoot);
  const before = (sprint.peers || []).length;
  sprint.peers = (sprint.peers || []).filter((p) => p.peer_id !== peer_id);
  writeSprint(channelRoot, sprint);
  return { ok: true, removed: sprint.peers.length < before };
}
