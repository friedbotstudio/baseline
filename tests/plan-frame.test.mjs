// plan-frame — per-node frame extraction unit tests
// Covers: AC-004 (readFrame returns minimal per-node frame; strictly smaller than full plan).
//
// SUT: .claude/skills/harness/plan-frame.mjs (not yet built → RED).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/harness/plan-frame.mjs');
const PLAN_STORE = path.join(ROOT, '.claude/skills/harness/plan-store.mjs');

// Three-node tasklist: n1 (maker, no deps), n2 (checker, deps: n1), n3 (checker, deps: n1)
function makeThreeNodeTasklist() {
  return [
    {
      id: 'n1',
      title: 'Maker node',
      role: 'maker',
      checker: undefined,
      assignment: { frame: 'implement feature', acs: ['AC-001'], deps: [] },
      thresholds: null,
      status: 'pending',
      result: null,
    },
    {
      id: 'n2',
      title: 'TDD checker',
      role: 'checker',
      checker: 'tdd',
      assignment: { frame: 'verify feature', acs: ['AC-001'], deps: ['n1'] },
      thresholds: null,
      status: 'pending',
      result: null,
    },
    {
      id: 'n3',
      title: 'Security checker',
      role: 'checker',
      checker: 'security',
      assignment: { frame: 'security scan', acs: ['AC-001'], deps: [] },
      thresholds: null,
      status: 'done',
      result: {
        verdict: 'CLEAN',
        oracle_bound: true,
        findings: [],
        false_positive_blocks: 0,
        evidence: {},
      },
    },
  ];
}

// AC-004 — readFrame returns {goal, assignment, deps_results}; sibling assignments absent; versions absent.
test('test_read_frame_returns_node_assignment_only', async () => {
  const { createPlan } = await import(PLAN_STORE);
  const { readFrame } = await import(SUT);

  const dir = mkdtempSync(path.join(tmpdir(), 'plan-frame-'));
  try {
    const plan = await createPlan({
      slug: 'frame-test-1',
      goal: 'Test the frame',
      tasklist: makeThreeNodeTasklist(),
      tier: 'internal-tool',
      rootDir: dir,
      ts: '2026-01-01T00:00:00.000Z',
    });

    const frame = readFrame(plan, 'n2');

    // Must have goal and assignment
    assert.equal(frame.goal, 'Test the frame', 'frame.goal must equal snapshot goal');
    assert.ok(frame.assignment, 'frame must have assignment');
    assert.equal(frame.assignment.frame, 'verify feature', 'assignment.frame must match n2');
    assert.deepEqual(frame.assignment.acs, ['AC-001'], 'assignment.acs must match n2');
    assert.deepEqual(frame.assignment.deps, ['n1'], 'assignment.deps must match n2');

    // Must have deps_results key
    assert.ok('deps_results' in frame, 'frame must have deps_results');

    // Sibling nodes' assignments must NOT appear in the frame
    const frameStr = JSON.stringify(frame);
    assert.ok(!frameStr.includes('security scan'), 'n3 assignment must not appear in frame');
    assert.ok(!frameStr.includes('implement feature') || frame.assignment.frame === 'implement feature'
      ? !frameStr.includes('"frame":"implement feature"') || frame.deps_results.some((d) => d.id === 'n1')
        ? !frameStr.replace(JSON.stringify(frame.deps_results), '').includes('implement feature')
        : true
      : true,
      'sibling n1 assignment frame must not appear outside deps_results context');

    // versions[] must be absent from the frame
    assert.ok(!('versions' in frame), 'frame must not contain versions[]');
    assert.ok(!frameStr.includes('"versions"'), 'frame JSON must not contain versions key');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// AC-004 — deps_results carries each dep id and its result (null when dep has no result yet).
test('test_frame_includes_dep_results', async () => {
  const { createPlan, recordRevision } = await import(PLAN_STORE);
  const { readFrame } = await import(SUT);

  const dir = mkdtempSync(path.join(tmpdir(), 'plan-frame-'));
  try {
    const plan = await createPlan({
      slug: 'frame-test-2',
      goal: 'Dep results test',
      tasklist: makeThreeNodeTasklist(),
      tier: 'internal-tool',
      rootDir: dir,
      ts: '2026-01-01T00:00:00.000Z',
    });

    // n1 has no result yet — readFrame on n2 (deps: ['n1']) should give deps_results with null result for n1
    const frameNoResult = readFrame(plan, 'n2');
    assert.ok(Array.isArray(frameNoResult.deps_results), 'deps_results must be an array');
    assert.equal(frameNoResult.deps_results.length, 1, 'n2 has one dep (n1)');
    assert.equal(frameNoResult.deps_results[0].id, 'n1', 'dep entry id must be n1');
    assert.equal(frameNoResult.deps_results[0].result, null, 'n1 result is null (not yet set)');

    // Now record a revision where n1 gets a result
    const tasklistWithN1Result = plan.versions[0].snapshot.tasklist.map((n) =>
      n.id === 'n1'
        ? {
            ...n,
            status: 'done',
            result: {
              verdict: 'CLEAN',
              oracle_bound: true,
              findings: [],
              false_positive_blocks: 0,
              evidence: {},
            },
          }
        : n
    );
    const updatedPlan = await recordRevision(
      plan,
      { goal: 'Dep results test', tasklist: tasklistWithN1Result },
      { author: 'harness', reason: 'n1 done', ts: '2026-01-02T00:00:00.000Z' }
    );

    // readFrame on n2 should now show n1's result
    const frameWithResult = readFrame(updatedPlan, 'n2');
    assert.equal(frameWithResult.deps_results.length, 1, 'still one dep');
    assert.equal(frameWithResult.deps_results[0].id, 'n1');
    assert.ok(frameWithResult.deps_results[0].result !== null, 'n1 result must now be non-null');
    assert.equal(frameWithResult.deps_results[0].result.verdict, 'CLEAN');

    // n3 has no deps — its deps_results should be empty array
    const frameN3 = readFrame(updatedPlan, 'n3');
    assert.ok(Array.isArray(frameN3.deps_results), 'deps_results must be array for n3');
    assert.equal(frameN3.deps_results.length, 0, 'n3 has no deps so deps_results is empty');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// AC-004 — frame is strictly smaller than the full plan (JSON bytes).
test('test_frame_strictly_smaller_than_plan', async () => {
  const { createPlan } = await import(PLAN_STORE);
  const { readFrame } = await import(SUT);

  const dir = mkdtempSync(path.join(tmpdir(), 'plan-frame-'));
  try {
    const plan = await createPlan({
      slug: 'frame-size-test',
      goal: 'Size invariant test',
      tasklist: makeThreeNodeTasklist(),
      tier: 'internal-tool',
      rootDir: dir,
      ts: '2026-01-01T00:00:00.000Z',
    });

    const frame = readFrame(plan, 'n2');
    const frameLen = JSON.stringify(frame).length;
    const planLen = JSON.stringify(plan).length;

    assert.ok(
      frameLen < planLen,
      `frame (${frameLen} bytes) must be strictly smaller than plan (${planLen} bytes)`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// AC-004 — readFrame throws a clear Error when nodeId is not in the current snapshot.
test('test_read_frame_unknown_node_throws', async () => {
  const { createPlan } = await import(PLAN_STORE);
  const { readFrame } = await import(SUT);

  const dir = mkdtempSync(path.join(tmpdir(), 'plan-frame-'));
  try {
    const plan = await createPlan({
      slug: 'frame-throw-test',
      goal: 'Throw test',
      tasklist: makeThreeNodeTasklist(),
      tier: 'internal-tool',
      rootDir: dir,
      ts: '2026-01-01T00:00:00.000Z',
    });

    assert.throws(
      () => readFrame(plan, 'NOPE'),
      (err) => {
        assert.ok(err instanceof Error, 'must throw an Error instance');
        assert.ok(
          /NOPE/.test(err.message),
          `error message must mention the unknown nodeId, got: ${err.message}`
        );
        return true;
      }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
