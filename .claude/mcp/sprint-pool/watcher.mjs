// Domain: the change-detection core. pollOnce reads the channel store and calls
// notify() for each newly-relevant change for this role, tracking `seen` so a given
// change is pushed exactly once. The fs.watch / interval shell that drives pollOnce
// lives in the Orchestration layer (server.mjs) — keeping this core pure makes it
// deterministically testable without watch timing.

import { readTasks, readYields } from '../sprint-channel/lib/store.mjs';

function claimableTasks(tasks) {
  const done = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id));
  return tasks.filter((t) => t.status === 'pending' && (t.depends_on || []).every((d) => done.has(d)));
}

function emitOnce(seen, key, notify, event) {
  if (seen.has(key)) return;
  seen.add(key);
  notify(event);
}

export function pollOnce({ channelRoot, role, notify, seen }) {
  if (role === 'lead') {
    for (const y of readYields(channelRoot)) {
      if (y.status === 'open') emitOnce(seen, `yield:${y.task_id}`, notify, { event: 'yield', task_id: y.task_id });
    }
    return;
  }
  for (const t of claimableTasks(readTasks(channelRoot))) {
    emitOnce(seen, `task:${t.id}`, notify, { event: 'task-available', task_id: t.id });
  }
}
