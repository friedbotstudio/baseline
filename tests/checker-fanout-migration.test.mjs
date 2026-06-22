// checker-fanout migration — mirrorVerdictToPlan (AC-008).
// The adapter mirrors a merged verdict into the durable plan object when one exists,
// while persistVerdict keeps writing the projection at .claude/state/checker-fanout/
// <slug>.json (spec_approval_guard's read path). With no plan it is a no-op (null),
// so the live gate-A path — which has no plan at spec-review time — is unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mirrorVerdictToPlan, mergeVerdicts } from '../.claude/skills/harness/checker-fanout.mjs';
import { createPlan, readPlan } from '../.claude/skills/harness/plan-store.mjs';

function minimalTasklist() {
  return [{ id: 'n1', title: 't', role: 'checker', assignment: { frame: 'f', acs: [], deps: [] }, thresholds: null, status: 'pending', result: null }];
}

test('AC-008: mirrorVerdictToPlan records the merged verdict on the plan losslessly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-mig-'));
  try {
    const merged = mergeVerdicts([{ checker: 'spec-diagram', findings: [] }, { checker: 'spec-traceability', findings: [] }]);
    assert.equal(merged.verdict, 'CLEAN');
    await createPlan({ slug: 'cf-mig', goal: 'g', tasklist: minimalTasklist(), tier: 'internal-tool', rootDir: dir, ts: '2026-01-01T00:00:00.000Z' });

    const updated = mirrorVerdictToPlan(dir, 'cf-mig', merged);

    assert.ok(updated, 'returns the updated plan when mirrored');
    assert.deepEqual(updated.artifacts.verdicts['cf-mig'], merged, 'verdict mirrored under the slug key');
    assert.deepEqual(readPlan('cf-mig', dir).artifacts.verdicts['cf-mig'], merged, 'verdict persisted to disk');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-008 back-compat: no plan on disk → null (live gate-A behavior unchanged)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-mig-nop-'));
  try {
    const merged = mergeVerdicts([{ checker: 'x', findings: [{ severity: 'BLOCKER', check: 'c', title: 't' }] }]);
    assert.equal(merged.verdict, 'BLOCKED', 'merge still computes the verdict normally');
    assert.equal(mirrorVerdictToPlan(dir, 'absent', merged), null, 'no plan → null, nothing persisted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
