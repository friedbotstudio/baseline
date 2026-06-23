// Foundation: crash-safe persistence for the broker's coordination state. The broker
// is the SOLE writer, so there is no cross-process race; the only failure to defend is
// a truncating crash mid-write. atomicPersist writes a temp file then renames it over
// the target (rename is atomic on POSIX), so a reader never observes a partial file.
// Reads are the baseline store primitives, re-exported READ-ONLY (never edited). node
// stdlib only.

import { writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { readTasks, readYields, readSprint } from '../sprint-channel/lib/store.mjs';

export { readTasks, readYields, readSprint };

const SLICE_FILES = { tasks: 'tasks.json', yields: 'yields.json', sprint: 'sprint.json' };

function persistSlice(channelRoot, name, value) {
  const tmp = join(channelRoot, `${name}.tmp-${process.pid}-${Math.floor(performance.now() * 1000)}`);
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, join(channelRoot, SLICE_FILES[name]));
}

export function atomicPersist(channelRoot, slices) {
  for (const name of Object.keys(SLICE_FILES)) {
    if (slices[name] !== undefined) persistSlice(channelRoot, name, slices[name]);
  }
}
