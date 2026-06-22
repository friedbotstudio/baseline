// plan-harness-wiring — live-wiring of the durable plan into the harness loop.
// Covers AC-009 (plan created at plan-mode entry, updated across a phase transition)
// and AC-010 (gated by velocity.durable_plan.enabled; fail-open when disabled/missing).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensurePlanAtPlanMode, recordPhaseTransition, isPlanWiringEnabled } from '../.claude/skills/harness/plan-wiring.mjs';
import { readPlan } from '../.claude/skills/harness/plan-store.mjs';

function makeRoot(enabled) {
  const dir = mkdtempSync(join(tmpdir(), 'plan-wiring-'));
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude/project.json'), JSON.stringify({ velocity: { durable_plan: { enabled } }, tier: { level: 'regulated' } }));
  return dir;
}

const TASKLIST = [{ id: 'n1', title: 't', role: 'maker', assignment: { frame: 'f', acs: [], deps: [] }, thresholds: null, status: 'pending', result: null }];

test('AC-009: enabled → plan created at plan-mode entry, idempotent, updated across a phase transition', async () => {
  const dir = makeRoot(true);
  try {
    assert.equal(isPlanWiringEnabled(dir), true);

    const plan = await ensurePlanAtPlanMode({ slug: 'w', rootDir: dir, goal: 'g', tasklist: TASKLIST, tier: 'regulated', ts: '2026-01-01T00:00:00.000Z' });
    assert.ok(plan, 'plan created at plan-mode entry');
    assert.equal(readPlan('w', dir).versions.length, 1, 'plan present on disk at v1');

    const again = await ensurePlanAtPlanMode({ slug: 'w', rootDir: dir, goal: 'g', tasklist: TASKLIST, tier: 'regulated' });
    assert.equal(again.versions.length, 1, 'ensure is idempotent — no duplicate create');

    const updated = await recordPhaseTransition({ slug: 'w', rootDir: dir, phase: 'tdd', ts: '2026-01-02T00:00:00.000Z' });
    assert.ok(updated, 'transition recorded');
    assert.equal(readPlan('w', dir).versions.length, 2, 'plan updated across the phase transition');
    assert.match(readPlan('w', dir).versions[1].reason, /tdd/, 'transition reason names the phase');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-010: disabled → fail-open, no plan writes (returns null)', async () => {
  const dir = makeRoot(false);
  try {
    assert.equal(isPlanWiringEnabled(dir), false);
    assert.equal(await ensurePlanAtPlanMode({ slug: 'off', rootDir: dir, goal: 'g', tasklist: TASKLIST, tier: 'regulated' }), null);
    assert.equal(readPlan('off', dir), null, 'no plan written when disabled');
    assert.equal(await recordPhaseTransition({ slug: 'off', rootDir: dir, phase: 'tdd' }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-010: missing/unreadable project.json → fail-open (treated as disabled)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-wiring-noconf-'));
  try {
    assert.equal(isPlanWiringEnabled(dir), false, 'unreadable config → disabled, never throws');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
