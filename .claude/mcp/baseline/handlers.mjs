// Domain: the 9 channel tool handlers. Each takes {channelRoot, ...contractInput}
// and returns the contracted result object (see spec Slice B Contracts table).
// Composed from the Foundation primitives (store/lock/schema). No SDK import —
// the MCP stdio wrapper (server.mjs) is a separate, deferred concern.

import {
  readSprint, writeSprint, readTasks, writeTasks, readYields, writeYields, appendMailbox,
  readMessages, writeMessages,
} from './lib/store.mjs';
import { withLock } from './lib/lock.mjs';
import { validateMessage } from './lib/schema.mjs';
import { isSafeId } from './lib/safe-id.mjs';
import { isClaimable, isValidStatus, satisfiesDependency } from './lib/tasks.mjs';
import { notifyClaimable } from './notify.mjs';

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
  if (!isClaimable(target.status)) return { claimed: false, reason: `task ${task_id} is not claimable (status ${target.status})` };
  const unmet = (target.depends_on || []).filter((dep) => {
    const d = findTask(tasks, dep);
    return !d || !satisfiesDependency(d.status);
  });
  if (unmet.length) return { claimed: false, reason: `unmet dependency: ${unmet.join(', ')}` };

  const lock = withLock(channelRoot, `task-${task_id}`, () => {
    const fresh = readTasks(channelRoot);
    const ft = findTask(fresh, task_id);
    if (!ft || !isClaimable(ft.status)) return false;
    ft.status = 'claimed';
    ft.claimed_by = peer_id;
    writeTasks(channelRoot, fresh);
    return true;
  });
  if (!lock.acquired) return { claimed: false, reason: 'task lock held by a concurrent claim' };
  return lock.result ? { claimed: true } : { claimed: false, reason: 'task already claimed' };
}

export function signalDone({ channelRoot, peer_id, task_id, commit_sha, notify }) {
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
  const done = new Set(tasks.filter((t) => satisfiesDependency(t.status)).map((t) => t.id));
  const unblocked = tasks
    .filter((t) => t.status === 'pending' && (t.depends_on || []).length > 0 && (t.depends_on || []).every((d) => done.has(d)))
    .map((t) => t.id);
  writeTasks(channelRoot, tasks);
  // The store is written before the pointers go out. A peer woken by a pointer
  // reconciles against the file, so the file has to already say what the pointer
  // claims — and a delivery failure after this line costs nothing but the wait.
  notifyClaimable(notify, tasks.filter((t) => unblocked.includes(t.id)));
  return { ok: true, unblocked };
}

// --- Article X escalation surface -------------------------------------------
// org-dispatch needs eight tools; the four below previously existed only on
// sprint-pool, which is a research-preview CHANNEL server and needs
// --dangerously-load-development-channels plus org policy to load. Hosting them
// here — a plain stdio server already in .mcp.json — is what lets a consumer run
// org mode with no flag. sprint-pool stays the opt-in push accelerator.

// Message ids are positional, not random: a channel's state is a plain file and
// the id must survive a re-read. `isSafeId`-clean so it can never widen a path.
const nextMessageId = (messages, peer_id) => `m${messages.length + 1}-${peer_id}`;

export function askLead({ channelRoot, peer_id, body }) {
  if (!isSafeId(peer_id)) return { ok: false, error: 'invalid peer_id' };
  if (typeof body !== 'string' || body.trim() === '') return { ok: false, error: 'empty body' };
  const messages = readMessages(channelRoot);
  const message_id = nextMessageId(messages, peer_id);
  messages.push({ message_id, from_peer: peer_id, body, answer: null, answered_at: null, ts: Date.now() });
  writeMessages(channelRoot, messages);
  return { ok: true, message_id };
}

export function answerPeer({ channelRoot, message_id, answer }) {
  if (typeof answer !== 'string' || answer.trim() === '') return { ok: false, error: 'empty answer' };
  const messages = readMessages(channelRoot);
  const target = messages.find((m) => m.message_id === message_id);
  if (!target) return { ok: false, error: `unknown message_id: ${message_id}` };
  // Idempotent: re-answering with the same text is a no-op so a retried relay
  // cannot move answered_at or duplicate the record.
  if (target.answer === answer) return { ok: true, already_answered: true };
  if (target.answer !== null) return { ok: false, error: `message ${message_id} already answered` };
  target.answer = answer;
  target.answered_at = Date.now();
  writeMessages(channelRoot, messages);
  return { ok: true };
}

export function sprintStatus({ channelRoot }) {
  const tasks = readTasks(channelRoot);
  const sprint = readSprint(channelRoot);
  return {
    ok: true,
    tasks,
    peers: sprint.peers || [],
    messages: readMessages(channelRoot),
    yields: readYields(channelRoot),
    // Authoritative completion check. Pushed events are lossy hints; this flag
    // is never dropped, so a lead reconciles from it rather than trusting a
    // push it may not have received. No tasks means nothing was dispatched,
    // which is not the same as finished.
    all_done: tasks.length > 0 && tasks.every((t) => t.status === 'done'),
  };
}

export function enqueueTask({ channelRoot, task_id, brief, write_set, depends_on, assignee, notify }) {
  if (!isSafeId(task_id)) return { ok: false, error: 'invalid task_id' };
  if (assignee !== undefined && assignee !== null && !isSafeId(assignee)) {
    return { ok: false, error: 'invalid assignee' };
  }
  const tasks = readTasks(channelRoot);
  const existing = findTask(tasks, task_id);
  // Idempotent by task_id so a re-dispatch cannot fork a lane in two.
  if (existing) return { ok: true, task_id, already_enqueued: true };
  tasks.push({
    id: task_id,
    brief: typeof brief === 'string' ? brief : '',
    write_set: Array.isArray(write_set) ? write_set : [],
    depends_on: Array.isArray(depends_on) ? depends_on : [],
    assignee: assignee || null,
    status: 'pending',
    claimed_by: null,
    commit_sha: null,
  });
  writeTasks(channelRoot, tasks);
  // A lane with unmet dependencies is not claimable yet; its pointer goes out
  // when signal_done unblocks it, not now.
  const enqueued = tasks[tasks.length - 1];
  if (enqueued.depends_on.length === 0) notifyClaimable(notify, [enqueued]);
  return { ok: true, task_id };
}

/**
 * Move a claimed task to another status. The claim is what authorises the move:
 * without that check any peer could drive another peer's lane.
 */
export function updateTask({ channelRoot, peer_id, task_id, status }) {
  if (!isSafeId(task_id) || !isSafeId(peer_id)) return { ok: false, error: 'invalid task_id or peer_id' };
  if (!isValidStatus(status)) return { ok: false, error: `invalid status: ${String(status)}` };
  const tasks = readTasks(channelRoot);
  const target = findTask(tasks, task_id);
  if (!target) return { ok: false, error: 'unknown task' };
  if (target.claimed_by !== peer_id) return { ok: false, error: `peer ${peer_id} does not hold the claim on ${task_id}` };
  target.status = status;
  writeTasks(channelRoot, tasks);
  return { ok: true, task_id, status };
}

/**
 * Retire a task that will never be worked. Completed work is refused: cancelling
 * it would erase the record that it happened.
 */
export function cancelTask({ channelRoot, task_id }) {
  if (!isSafeId(task_id)) return { ok: false, error: 'invalid task_id' };
  const tasks = readTasks(channelRoot);
  const target = findTask(tasks, task_id);
  if (!target) return { ok: false, error: 'unknown task' };
  if (target.status === 'done') return { ok: false, error: `task ${task_id} is done and cannot be cancelled` };
  if (target.status === 'cancelled') return { ok: true, task_id, already_cancelled: true };
  target.status = 'cancelled';
  target.claimed_by = null;
  writeTasks(channelRoot, tasks);
  return { ok: true, task_id };
}

/** Read the lane board. Read-only by contract — it never normalises what it finds. */
export function listTasks({ channelRoot }) {
  return { ok: true, tasks: readTasks(channelRoot) };
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
