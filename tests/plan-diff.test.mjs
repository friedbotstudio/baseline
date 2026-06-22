// plan-diff — structural diff between plan versions unit tests
// Covers: AC-006 (diff auditability — visible replan diff without a stored patch chain)
//
// SUT: .claude/skills/harness/plan-diff.mjs (not yet built → RED).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STORE_SUT = path.join(ROOT, '.claude/skills/harness/plan-store.mjs');
const DIFF_SUT = path.join(ROOT, '.claude/skills/harness/plan-diff.mjs');

// Minimal node factory — plan-store resolves thresholds, so we provide the
// fields createPlan expects (checker: undefined → default thresholds applied).
function makeNode(id, assignment = {}) {
  return {
    id,
    title: `Node ${id}`,
    role: 'maker',
    checker: undefined,
    assignment: { frame: `frame-${id}`, acs: [], deps: [], ...assignment },
    thresholds: null, // resolved by createPlan
    status: 'pending',
    result: null,
  };
}

describe('plan-diff (AC-006)', () => {
  // AC-006 — a v1→v2 that adds one node and removes another
  it('test_diff_detects_added_and_removed_nodes', async () => {
    const { createPlan, recordRevision } = await import(STORE_SUT);
    const { diffVersions } = await import(DIFF_SUT);

    const dir = mkdtempSync(path.join(tmpdir(), 'plan-diff-'));
    try {
      // v1: nodes A, B
      const plan = await createPlan({
        slug: 'diff-add-remove',
        goal: 'Test goal',
        tasklist: [makeNode('A'), makeNode('B')],
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      // v2: node B removed, node C added
      const v1Tasklist = plan.versions[0].snapshot.tasklist;
      const nodeB = v1Tasklist.find((n) => n.id === 'B');
      const nodeC = { ...makeNode('C'), thresholds: nodeB.thresholds };
      const v2Snapshot = {
        goal: 'Test goal',
        tasklist: [v1Tasklist.find((n) => n.id === 'A'), nodeC],
      };

      const plan2 = await recordRevision(plan, v2Snapshot, {
        author: 'harness',
        reason: 'replan',
        ts: '2026-01-02T00:00:00.000Z',
      });

      const diff = diffVersions(plan2, 1, 2);

      assert.deepEqual(diff.added, ['C'], 'C was added in v2');
      assert.deepEqual(diff.removed, ['B'], 'B was removed in v2');
      assert.deepEqual(diff.changed, [], 'no nodes changed');
      assert.equal(diff.goal_changed, null, 'goal did not change');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-006 — a node whose assignment changed appears in changed (not in added/removed)
  it('test_diff_detects_changed_node', async () => {
    const { createPlan, recordRevision } = await import(STORE_SUT);
    const { diffVersions } = await import(DIFF_SUT);

    const dir = mkdtempSync(path.join(tmpdir(), 'plan-diff-'));
    try {
      const plan = await createPlan({
        slug: 'diff-changed',
        goal: 'Test goal',
        tasklist: [makeNode('X'), makeNode('Y')],
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      const v1Tasklist = plan.versions[0].snapshot.tasklist;
      // Mutate node X's assignment in v2
      const mutatedX = { ...v1Tasklist.find((n) => n.id === 'X'), assignment: { frame: 'new-frame', acs: ['AC-999'], deps: [] } };
      const v2Snapshot = {
        goal: 'Test goal',
        tasklist: [mutatedX, v1Tasklist.find((n) => n.id === 'Y')],
      };

      const plan2 = await recordRevision(plan, v2Snapshot, {
        author: 'harness',
        reason: 'mutation',
        ts: '2026-01-02T00:00:00.000Z',
      });

      const diff = diffVersions(plan2, 1, 2);

      assert.deepEqual(diff.changed, ['X'], 'X changed between versions');
      assert.deepEqual(diff.added, [], 'nothing added');
      assert.deepEqual(diff.removed, [], 'nothing removed');
      assert.equal(diff.goal_changed, null, 'goal unchanged');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-006 — goal_changed = {from, to} when the goal differs, null when identical
  it('test_diff_detects_goal_change', async () => {
    const { createPlan, recordRevision } = await import(STORE_SUT);
    const { diffVersions } = await import(DIFF_SUT);

    const dir = mkdtempSync(path.join(tmpdir(), 'plan-diff-'));
    try {
      const plan = await createPlan({
        slug: 'diff-goal',
        goal: 'Original goal',
        tasklist: [makeNode('M')],
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      const v1Tasklist = plan.versions[0].snapshot.tasklist;

      // v2: same tasklist, different goal
      const plan2 = await recordRevision(plan, { goal: 'New goal', tasklist: v1Tasklist }, {
        author: 'harness',
        reason: 'goal change',
        ts: '2026-01-02T00:00:00.000Z',
      });

      // v3: same goal as v2
      const plan3 = await recordRevision(plan2, { goal: 'New goal', tasklist: v1Tasklist }, {
        author: 'harness',
        reason: 'no goal change',
        ts: '2026-01-03T00:00:00.000Z',
      });

      const diffChanged = diffVersions(plan2, 1, 2);
      assert.deepEqual(diffChanged.goal_changed, { from: 'Original goal', to: 'New goal' }, 'goal_changed captures from/to');

      const diffSame = diffVersions(plan3, 2, 3);
      assert.equal(diffSame.goal_changed, null, 'goal_changed is null when goal identical');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-006 — arrays are sorted/deterministic regardless of tasklist order
  it('test_diff_is_order_independent', async () => {
    const { createPlan, recordRevision } = await import(STORE_SUT);
    const { diffVersions } = await import(DIFF_SUT);

    const dir = mkdtempSync(path.join(tmpdir(), 'plan-diff-'));
    try {
      // v1: nodes Z, A, M (unsorted order)
      const plan = await createPlan({
        slug: 'diff-order',
        goal: 'Test goal',
        tasklist: [makeNode('Z'), makeNode('A'), makeNode('M')],
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      const v1Tasklist = plan.versions[0].snapshot.tasklist;
      const nodeA = v1Tasklist.find((n) => n.id === 'A');
      const nodeZ = v1Tasklist.find((n) => n.id === 'Z');

      // v2: remove M and Z, add B and C, keep A
      const nodeB = { ...makeNode('B'), thresholds: nodeA.thresholds };
      const nodeC = { ...makeNode('C'), thresholds: nodeA.thresholds };
      const v2Snapshot = {
        goal: 'Test goal',
        tasklist: [nodeC, nodeA, nodeB], // deliberately unsorted order
      };

      const plan2 = await recordRevision(plan, v2Snapshot, {
        author: 'harness',
        reason: 'reorder test',
        ts: '2026-01-02T00:00:00.000Z',
      });

      const diff = diffVersions(plan2, 1, 2);

      // Arrays must be sorted by id
      assert.deepEqual(diff.added, ['B', 'C'], 'added sorted by id');
      assert.deepEqual(diff.removed, ['M', 'Z'], 'removed sorted by id');
      assert.deepEqual(diff.changed, [], 'A unchanged');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-006 — diffVersions propagates getVersion's out-of-range throw
  it('test_diff_out_of_range_version_throws', async () => {
    const { createPlan } = await import(STORE_SUT);
    const { diffVersions } = await import(DIFF_SUT);

    const dir = mkdtempSync(path.join(tmpdir(), 'plan-diff-'));
    try {
      const plan = await createPlan({
        slug: 'diff-throw',
        goal: 'Throw test',
        tasklist: [makeNode('P')],
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      // plan has only v1; requesting v99 must throw
      assert.throws(
        () => diffVersions(plan, 1, 99),
        /version 99 not found/i,
        'diffVersions must propagate out-of-range throw from getVersion'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
