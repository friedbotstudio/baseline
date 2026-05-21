// Workflow-extension-via-workflows-json — byte-equivalent migration check
//
// For each canonical track (intake-full / spec-entry / tdd-quickfix / chore),
// load the pre-amendment golden TaskList fixture and compare against the
// TaskList shape that the new `materializeTaskList(track)` helper produces
// when fed the corresponding workflows.jsonl track record. The shape
// comparison covers: ordinal positions, subjects, activeForm, metadata.phase,
// needs_user flags, and blockedBy edges (translated to ordinal references).
//
// The materializer module is expected at
// `src/cli/track-tasklist-materializer.js` — does not exist yet (RED until
// /implement lands).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');
const GOLDENS = path.join(HERE, 'fixtures/golden-tasklists');

let materializer;
let validator;
try {
  materializer = await import(path.join(REPO_ROOT, 'src/cli/track-tasklist-materializer.js'));
  validator = await import(path.join(REPO_ROOT, 'src/cli/workflows-validator.js'));
} catch (err) {
  throw new Error(
    `Required modules not yet implemented (RED is expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}

async function loadGolden(trackId) {
  const raw = await fs.readFile(path.join(GOLDENS, `${trackId}.golden.json`), 'utf8');
  return JSON.parse(raw);
}

async function materializeFromLiveJsonl(trackId) {
  const livePath = path.join(REPO_ROOT, '.claude/workflows.jsonl');
  const validation = await validator.validateWorkflowsJsonl(livePath);
  assert.equal(validation.ok, true, `live workflows.jsonl failed validation: ${JSON.stringify(validation.errors)}`);
  const track = validation.tracks.find((t) => t.track_id === trackId);
  assert.ok(track, `live workflows.jsonl missing track_id=${trackId}`);
  return materializer.materializeTaskList(track, { slug: '<slug>' });
}

// Foundation: compare two TaskList shapes by ordinal, subject, activeForm,
// metadata.phase, needs_user, blockedBy ordinals. Ignores task_id (which is
// session-scoped at runtime).
function assertTaskListShapeEqual(actual, expected, trackId) {
  assert.equal(actual.length, expected.length, `${trackId}: task count mismatch (actual=${actual.length}, expected=${expected.length})`);
  for (let i = 0; i < expected.length; i++) {
    const a = actual[i];
    const e = expected[i];
    assert.equal(a.subject, e.subject, `${trackId} task[${i}]: subject mismatch`);
    assert.equal(a.activeForm, e.activeForm, `${trackId} task[${i}]: activeForm mismatch`);
    assert.deepEqual(a.metadata, e.metadata, `${trackId} task[${i}]: metadata mismatch`);
    assert.equal(a.needs_user, e.needs_user, `${trackId} task[${i}]: needs_user mismatch`);
    assert.deepEqual(a.blockedBy, e.blockedBy, `${trackId} task[${i}]: blockedBy mismatch`);
  }
}

describe('byte-equivalent migration (SP-008 / AC-016)', () => {
  it('test_when_byte_equivalent_pre_post_migration_then_intake_full_tasklists_match', async () => {
    const golden = await loadGolden('intake-full');
    const actual = await materializeFromLiveJsonl('intake-full');
    assertTaskListShapeEqual(actual, golden.tasks, 'intake-full');
  });

  it('test_when_byte_equivalent_pre_post_migration_then_spec_entry_tasklists_match', async () => {
    const golden = await loadGolden('spec-entry');
    const actual = await materializeFromLiveJsonl('spec-entry');
    assertTaskListShapeEqual(actual, golden.tasks, 'spec-entry');
  });

  it('test_when_byte_equivalent_pre_post_migration_then_tdd_quickfix_tasklists_match', async () => {
    const golden = await loadGolden('tdd-quickfix');
    const actual = await materializeFromLiveJsonl('tdd-quickfix');
    assertTaskListShapeEqual(actual, golden.tasks, 'tdd-quickfix');
  });

  it('test_when_byte_equivalent_pre_post_migration_then_chore_tasklists_match', async () => {
    const golden = await loadGolden('chore');
    const actual = await materializeFromLiveJsonl('chore');
    assertTaskListShapeEqual(actual, golden.tasks, 'chore');
  });
});
