// companion watch helper (prototype tooling; NOT baseline-owned, NOT shipped).
//
// Blocks until a task on the file-based sprint channel becomes claimable by
// <peer_id>, then exits 0 so the idle companion session is re-invoked (via the
// background-task-completion notification) to claim it. This is the peer-side
// wake the file channel otherwise lacks — the same background→re-invoke pattern
// the lead uses to watch the channel.
//
// Exit codes:
//   0  a claimable task appeared    → re-enter the claim loop (task_id in stdout)
//   2  the companion marker is inactive (`/companion off`) → stop watching
//   3  heartbeat cap reached        → re-arm the watcher (keeps turns bounded)
//   1  usage error

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [sprintId, peerId] = process.argv.slice(2);
if (!sprintId || !peerId) {
  console.error('usage: watch.mjs <sprint_id> <peer_id>');
  process.exit(1);
}

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const channelDir = join(root, '.claude', 'state', 'sprint', sprintId);
const markerPath = join(root, '.claude', 'state', 'companion', `${sprintId}.json`);

const readJson = (path, fallback) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
};

// Absent marker → treat as active (the peer just registered); active:false stops.
const markerActive = () => {
  const marker = readJson(markerPath, null);
  return marker ? marker.active !== false : true;
};

// Mirror claimTask's claimability rule: pending, deps all done, and either
// unassigned or directed at this peer.
const firstClaimable = (tasks) => {
  const done = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id));
  return tasks.find((t) => t.status === 'pending'
    && (!t.assignee || t.assignee === peerId)
    && (t.depends_on || []).every((dep) => done.has(dep)));
};

const POLL_MS = 2000;
const HEARTBEAT_MS = 60 * 60 * 1000;
const startedAt = Date.now();

const tick = () => {
  if (!markerActive()) {
    console.log(JSON.stringify({ wake: false, reason: 'companion inactive' }));
    process.exit(2);
  }
  const task = firstClaimable(readJson(join(channelDir, 'tasks.json'), []));
  if (task) {
    console.log(JSON.stringify({ wake: true, task_id: task.id }));
    process.exit(0);
  }
  if (Date.now() - startedAt > HEARTBEAT_MS) {
    console.log(JSON.stringify({ wake: false, reason: 'heartbeat' }));
    process.exit(3);
  }
  setTimeout(tick, POLL_MS);
};

tick();
