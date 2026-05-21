// Workflow-extension-via-workflows-json — validator basics
//
// Scope: load-and-shape assertions for `src/cli/workflows-validator.js` (does
// not exist yet; tests are RED on import until /implement lands). Invariant
// failure modes are covered in workflows-jsonl-invariants.test.mjs; this file
// covers the happy-path parse + return shape.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');
const FIXTURES = path.join(HERE, 'fixtures/workflows-jsonl');

let validator;
try {
  validator = await import(path.join(REPO_ROOT, 'src/cli/workflows-validator.js'));
} catch (err) {
  throw new Error(
    `src/cli/workflows-validator.js not yet implemented (RED is expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}

describe('workflows-validator — happy path', () => {
  it('test_when_workflows_jsonl_well_formed_then_validator_returns_track_array', async () => {
    const result = await validator.validateWorkflowsJsonl(
      path.join(FIXTURES, 'well-formed.jsonl')
    );
    assert.equal(result.ok, true, 'well-formed fixture must validate without errors');
    assert.ok(Array.isArray(result.tracks), 'result.tracks must be an array');
    assert.equal(result.tracks.length, 3, 'well-formed fixture has 3 tracks (intake-full, swarm-implementation, tdd-worker-chain)');
    const trackIds = result.tracks.map((t) => t.track_id).sort();
    assert.deepEqual(trackIds, ['intake-full', 'swarm-implementation', 'tdd-worker-chain']);
    const selectable = result.tracks.filter((t) => t.selectable === true);
    assert.equal(selectable.length, 1, 'only intake-full is selectable in this fixture');
    const intakeFull = result.tracks.find((t) => t.track_id === 'intake-full');
    assert.ok(intakeFull.nodes.length === 15, 'intake-full has 15 nodes');
    assert.ok(
      intakeFull.nodes.find((n) => n.type === 'selector' && n.id === 'implementation'),
      'intake-full has a selector node id=implementation'
    );
  });
});
