// Foundation — one-shot migrator that rewrites a pre-§18 `workflow.json`
// (entry_phase set, no track_id) into the post-§18 shape (track_id, plus
// skipped_alternates[]) in place. Idempotent on already-post-§18 input.
// Throws a named error when entry_phase is not in the canonical map.

import { readFile, writeFile } from 'node:fs/promises';

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
  await writeFile(filePath, JSON.stringify(migrated, null, 2) + '\n');
  return { migrated: true, track_id: trackId };
}
