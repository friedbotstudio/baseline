// Foundation — one-shot migrator that rewrites a pre-§18 `workflow.json`
// (entry_phase set, no track_id) into the post-§18 shape (track_id, plus
// skipped_alternates[]) in place. Idempotent on already-post-§18 input.
// Throws a named error when entry_phase is not in the canonical map.

import { readFile, writeFile, rename, unlink } from 'node:fs/promises';

export const ENTRY_PHASE_TO_TRACK_ID = Object.freeze({
  intake: 'intake-full',
  spec: 'spec-entry',
  tdd: 'tdd-quickfix',
  chore: 'chore',
});

export async function migrateWorkflowJsonInPlace(filePath) {
  const text = await readFile(filePath, 'utf8');
  const data = JSON.parse(text);
  if ('track_id' in data && !('entry_phase' in data)) {
    return { migrated: false, reason: 'already post-§18' };
  }
  if (!('entry_phase' in data)) {
    return { migrated: false, reason: 'no entry_phase and no track_id; cannot determine shape' };
  }
  const entryPhase = data.entry_phase;
  const trackId = ENTRY_PHASE_TO_TRACK_ID[entryPhase];
  if (!trackId) {
    throw new Error(
      `Pre-§18 workflow.json has unmapped entry_phase='${entryPhase}'. ` +
      `Canonical map covers ${Object.keys(ENTRY_PHASE_TO_TRACK_ID).join(', ')}. ` +
      `Cannot migrate; run /triage to restart this workflow.`
    );
  }
  const migrated = { ...data };
  migrated.track_id = trackId;
  migrated.skipped_alternates = Array.isArray(data.skipped_alternates) ? data.skipped_alternates : [];
  migrated.updated_at = Math.floor(Date.now() / 1000);
  delete migrated.entry_phase;
  // Atomic temp+rename (CWE-362): rename(2) is atomic on POSIX, so a crash
  // mid-migration can't leave workflow.json half-written and unparseable — the
  // file the harness reads on the next session is either the old shape or the
  // fully-migrated one. Inlined (not the hooks-lib writeJsonAtomic) to keep this
  // src/cli module free of a cross-tree dependency; the build mirrors this file
  // byte-for-byte to .claude/skills/harness/workflow-migrator.js.
  const tmp = `${filePath}.tmp.${process.pid}`;
  try {
    await writeFile(tmp, JSON.stringify(migrated, null, 2) + '\n');
    await rename(tmp, filePath);
  } catch (err) {
    try { await unlink(tmp); } catch {}
    throw err;
  }
  return { migrated: true, track_id: trackId };
}
