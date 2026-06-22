// replan — applyReplan unit tests
// Covers: AC-003 (replan-RECORD primitive).
//
// SUT: .claude/skills/harness/replan.mjs (not yet built → RED).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/harness/replan.mjs');
const PLAN_STORE = path.join(ROOT, '.claude/skills/harness/plan-store.mjs');

// Minimal node that satisfies plan-store's threshold-resolution path.
// checker: undefined → no tier-dial call; thresholds resolved to DEFAULT_THRESHOLD by createPlan.
function makeMinimalTasklist() {
  return [
    {
      id: 'n1',
      title: 'Maker node',
      role: 'maker',
      checker: undefined,
      assignment: { frame: 'implement something', acs: ['AC-003'], deps: [] },
      thresholds: null,
      status: 'pending',
      result: null,
    },
  ];
}

describe('replan — applyReplan (AC-003)', () => {
  // AC-003: a valid update-assignment op appends version v+1; prior v1 is still retrievable;
  // goal is unchanged in the new version.
  it('test_apply_replan_records_new_version', async () => {
    const { applyReplan } = await import(SUT);
    const { createPlan, getVersion } = await import(PLAN_STORE);
    const dir = mkdtempSync(path.join(tmpdir(), 'replan-'));
    try {
      const plan = await createPlan({
        slug: 'replan-v',
        goal: 'original goal',
        tasklist: makeMinimalTasklist(),
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      const originalVersionCount = plan.versions.length;
      assert.equal(originalVersionCount, 1, 'plan starts at v1');

      const v1Snap = getVersion(plan, 1);
      const newAssignment = { frame: 'updated frame', acs: ['AC-003'], deps: [] };

      const updatedPlan = await applyReplan(
        plan,
        { op: 'update-assignment', nodeId: 'n1', assignment: newAssignment },
        { author: 'harness', reason: 'reassign n1', ts: '2026-01-02T00:00:00.000Z' }
      );

      // Version count must be v+1
      assert.equal(updatedPlan.versions.length, 2, 'returned plan must have 2 versions after applyReplan');

      // New version has correct metadata
      const v2 = updatedPlan.versions[1];
      assert.equal(v2.v, 2, 'new version must be v=2');

      // Prior version v1 still retrievable with original snapshot
      const v1Retrieved = getVersion(updatedPlan, 1);
      assert.deepEqual(v1Retrieved, v1Snap, 'v1 snapshot must be byte-identically preserved');

      // Goal is unchanged in the new version
      assert.equal(v2.snapshot.goal, 'original goal', 'goal must be unchanged across replan');

      // Assignment updated on n1 in new snapshot
      const n1New = v2.snapshot.tasklist.find((n) => n.id === 'n1');
      assert.ok(n1New, 'n1 must exist in new snapshot');
      assert.deepEqual(n1New.assignment, newAssignment, 'n1 assignment must be updated');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-003: a set-result op records a node result that appears in the new current snapshot.
  it('test_apply_replan_set_result_then_mergeable', async () => {
    const { applyReplan } = await import(SUT);
    const { createPlan, currentSnapshot } = await import(PLAN_STORE);
    const dir = mkdtempSync(path.join(tmpdir(), 'replan-result-'));
    try {
      const plan = await createPlan({
        slug: 'replan-result',
        goal: 'goal',
        tasklist: makeMinimalTasklist(),
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      const nodeResult = {
        verdict: 'CLEAN',
        findings: [],
        false_positive_blocks: 0,
      };

      const updatedPlan = await applyReplan(
        plan,
        { op: 'set-result', nodeId: 'n1', result: nodeResult },
        { author: 'harness', ts: '2026-01-02T00:00:00.000Z' }
      );

      // New version must be appended
      assert.equal(updatedPlan.versions.length, 2, 'set-result op must record a new version');

      // Node result must appear in the current snapshot
      const snap = currentSnapshot(updatedPlan);
      const n1 = snap.tasklist.find((n) => n.id === 'n1');
      assert.ok(n1, 'n1 must exist in current snapshot');
      assert.deepEqual(n1.result, nodeResult, 'n1.result must match the set-result payload');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-003: invalid change shapes throw AND do NOT append a version.
  it('test_apply_replan_invalid_change_throws_and_no_record', async () => {
    const { applyReplan } = await import(SUT);
    const { createPlan } = await import(PLAN_STORE);
    const dir = mkdtempSync(path.join(tmpdir(), 'replan-invalid-'));
    try {
      const plan = await createPlan({
        slug: 'replan-invalid',
        goal: 'goal',
        tasklist: makeMinimalTasklist(),
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      const meta = { author: 'test', ts: '2026-01-02T00:00:00.000Z' };

      // (a) unknown op
      await assert.rejects(
        () => applyReplan(plan, { op: 'no-such-op', nodeId: 'n1' }, meta),
        (err) => {
          assert.ok(err instanceof Error, 'must throw an Error');
          assert.ok(/no-such-op|unknown op/i.test(err.message), `message must mention unknown op, got: ${err.message}`);
          return true;
        }
      );
      assert.equal(plan.versions.length, 1, 'unknown op must not append a version');

      // (b) unknown nodeId in a valid op
      await assert.rejects(
        () => applyReplan(plan, { op: 'update-assignment', nodeId: 'ghost', assignment: {} }, meta),
        (err) => {
          assert.ok(err instanceof Error, 'must throw an Error');
          assert.ok(/ghost|nodeId|unknown node|not found/i.test(err.message), `message must mention unknown nodeId, got: ${err.message}`);
          return true;
        }
      );
      assert.equal(plan.versions.length, 1, 'unknown nodeId must not append a version');

      // (c) add-node with a duplicate id (produces invalid plan → validatePlan returns {ok:false})
      await assert.rejects(
        () =>
          applyReplan(
            plan,
            {
              op: 'add-node',
              node: {
                id: 'n1', // duplicate — n1 already exists
                title: 'Duplicate',
                role: 'maker',
                checker: undefined,
                assignment: { frame: 'dup', acs: [], deps: [] },
                thresholds: null,
                status: 'pending',
                result: null,
              },
            },
            meta
          ),
        (err) => {
          assert.ok(err instanceof Error, 'must throw an Error for duplicate node id');
          return true;
        }
      );
      assert.equal(plan.versions.length, 1, 'duplicate-id add-node must not append a version');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-003: applyReplan does not mutate the caller's original plan object;
  // the returned plan has version count 2, prior versions on it are intact.
  it('test_apply_replan_does_not_mutate_caller', async () => {
    const { applyReplan } = await import(SUT);
    const { createPlan } = await import(PLAN_STORE);
    const dir = mkdtempSync(path.join(tmpdir(), 'replan-nomutate-'));
    try {
      const plan = await createPlan({
        slug: 'replan-nomutate',
        goal: 'goal',
        tasklist: makeMinimalTasklist(),
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      const newAssignment = { frame: 'new frame', acs: ['AC-003'], deps: [] };

      const updatedPlan = await applyReplan(
        plan,
        { op: 'update-assignment', nodeId: 'n1', assignment: newAssignment },
        { author: 'harness', ts: '2026-01-02T00:00:00.000Z' }
      );

      // Returned plan has v+1 versions
      assert.equal(updatedPlan.versions.length, 2, 'returned plan must have 2 versions');
      assert.equal(updatedPlan.versions[0].v, 1, 'first version on returned plan must be v=1');
      assert.equal(updatedPlan.versions[1].v, 2, 'second version on returned plan must be v=2');

      // Original plan's versions array length must remain 1 (no in-place mutation)
      assert.equal(plan.versions.length, 1, 'original plan.versions must remain length 1 (no mutation)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
