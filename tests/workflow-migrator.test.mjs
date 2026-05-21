// Workflow-extension-via-workflows-json — pre-§17 workflow.json migrator
//
// On the post-§17 baseline, an in-flight workflow.json carrying the pre-§17
// shape (entry_phase field, no track_id) must be transformed in place by a
// one-shot migrator before the harness loads it. The canonical map:
//   intake → intake-full
//   spec   → spec-entry
//   tdd    → tdd-quickfix
//   chore  → chore
// completed[] is remapped from phase names to node ids (mostly identity in
// the canonical tracks; selector-wrapper names differ).
//
// The migrator module is expected at `src/cli/workflow-migrator.js` — does
// not exist yet (RED on import until /implement lands).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');
const FIXTURE = path.join(HERE, 'fixtures/workflow-json/pre-seventeen.json');

let migrator;
try {
  migrator = await import(path.join(REPO_ROOT, 'src/cli/workflow-migrator.js'));
} catch (err) {
  throw new Error(
    `src/cli/workflow-migrator.js not yet implemented (RED is expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}

describe('workflow.json migrator (pre-§17 shape → post-§17)', () => {
  it('test_when_workflow_json_pre_seventeen_shape_then_migrator_transforms_in_place', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'migrator-'));
    try {
      const dest = path.join(tmp, 'workflow.json');
      await fs.copyFile(FIXTURE, dest);
      const result = await migrator.migrateWorkflowJsonInPlace(dest);
      assert.equal(result.migrated, true, 'migrator must report migrated=true on pre-§17 input');
      const after = JSON.parse(await fs.readFile(dest, 'utf8'));
      assert.equal(after.track_id, 'intake-full', 'entry_phase=intake maps to track_id=intake-full');
      assert.ok(!('entry_phase' in after), 'entry_phase field removed after migration');
      assert.deepEqual(after.completed, ['intake', 'scout'], 'completed[] preserved (mostly identity in intake-full track)');
      assert.deepEqual(after.skipped_alternates, [], 'skipped_alternates initialized to empty array');
      assert.equal(typeof after.updated_at, 'number', 'updated_at refreshed');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_workflow_json_already_post_seventeen_then_migrator_is_idempotent', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'migrator-idem-'));
    try {
      const dest = path.join(tmp, 'workflow.json');
      const postShape = {
        request: 'already migrated',
        slug: 'sample',
        track_id: 'intake-full',
        exceptions: [],
        completed: ['intake'],
        skipped_alternates: [],
        source_backlog_keys: [],
        created_at: 1779285000,
        updated_at: 1779286000,
      };
      await fs.writeFile(dest, JSON.stringify(postShape, null, 2));
      const result = await migrator.migrateWorkflowJsonInPlace(dest);
      assert.equal(result.migrated, false, 'migrator must report migrated=false when shape is already post-§17');
      const after = JSON.parse(await fs.readFile(dest, 'utf8'));
      assert.deepEqual(after, postShape, 'post-§17 input passes through unmodified');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
