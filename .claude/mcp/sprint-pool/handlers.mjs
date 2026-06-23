// Domain: the project-local pool tool handlers — enqueue_task, register (auto-join),
// leave_peer, release (re-dispatch). Pure functions {channelRoot, ...args} -> result,
// mirroring the baseline sprint-channel handlers. Composed from the baseline Foundation
// primitives (store/lock/safe-id), imported READ-ONLY — no baseline file is edited.

import { readSprint, writeSprint, readTasks, writeTasks } from '../sprint-channel/lib/store.mjs';
import { withLock } from '../sprint-channel/lib/lock.mjs';
import { isSafeId } from '../sprint-channel/lib/safe-id.mjs';

const findPeer = (sprint, peerId) => (sprint.peers || []).find((p) => p.peer_id === peerId);

export function enqueueTask({ channelRoot, task_id, brief = '', write_set = [], depends_on = [] }) {
  if (!isSafeId(task_id)) return { enqueued: false, error: 'invalid task_id' };
  const lock = withLock(channelRoot, `enqueue-${task_id}`, () => {
    const tasks = readTasks(channelRoot);
    if (tasks.some((t) => t.id === task_id)) return { enqueued: false, reason: 'duplicate' };
    tasks.push({ id: task_id, status: 'pending', brief, write_set, depends_on, claimed_by: null, origin: 'enqueue' });
    writeTasks(channelRoot, tasks);
    return { enqueued: true, task_id };
  });
  if (!lock.acquired) return { enqueued: false, reason: 'enqueue lock held by a concurrent call' };
  return lock.result;
}

export function registerPoolPeer({ channelRoot, peer_id, role = 'peer', workspace = '.', sprintModeEnabled }) {
  if (!isSafeId(peer_id)) return { registered: false, error: 'invalid peer_id' };
  if (!sprintModeEnabled) return { registered: false, reason: 'sprint_mode disabled' };
  const sprint = readSprint(channelRoot);
  sprint.peers = sprint.peers || [];
  const record = { peer_id, pclass: 'session', role, workspace, active: true, channel: 'sprint-pool' };
  const at = sprint.peers.findIndex((p) => p.peer_id === peer_id);
  if (at >= 0) sprint.peers[at] = record;
  else sprint.peers.push(record);
  writeSprint(channelRoot, sprint);
  return { registered: true };
}

export function leavePeer({ channelRoot, peer_id }) {
  if (!isSafeId(peer_id)) return { ok: false, error: 'invalid peer_id' };
  const sprint = readSprint(channelRoot);
  const target = findPeer(sprint, peer_id);
  if (!target) return { ok: false, error: 'unknown peer' };
  target.active = false;
  writeSprint(channelRoot, sprint);
  return { ok: true, active: false };
}

export function releaseTask({ channelRoot, task_id, brief }) {
  if (!isSafeId(task_id)) return { released: false, error: 'invalid task_id' };
  const lock = withLock(channelRoot, `release-${task_id}`, () => {
    const tasks = readTasks(channelRoot);
    const target = tasks.find((t) => t.id === task_id);
    if (!target) return { released: false, reason: 'unknown task' };
    target.status = 'pending';
    target.claimed_by = null;
    if (brief !== undefined) target.brief = brief;
    writeTasks(channelRoot, tasks);
    return { released: true };
  });
  if (!lock.acquired) return { released: false, reason: 'release lock held by a concurrent call' };
  return lock.result;
}
