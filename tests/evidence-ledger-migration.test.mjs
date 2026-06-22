// evidence-ledger migration — recordRoundTripOnPlan (AC-007).
// The adapter persists round-trips through the durable plan object when one exists,
// while preserving the on-disk projection (graduation-gate's read path). With no
// plan it is identical to appendRoundTrip — projection only — so the existing
// evidence-ledger suite (and graduation-gate) behave unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recordRoundTripOnPlan, readLedger } from '../.claude/skills/harness/evidence-ledger.mjs';
import { createPlan, readPlan } from '../.claude/skills/harness/plan-store.mjs';

const RT = { id: 'rt-1', maker: 'm', checker: 'c', false_positive_blocks: 0, verdict: 'CLEAN' };

function minimalTasklist() {
  return [{ id: 'n1', title: 't', role: 'maker', assignment: { frame: 'f', acs: [], deps: [] }, thresholds: null, status: 'pending', result: null }];
}

test('AC-007: recordRoundTripOnPlan writes the projection AND mirrors into the plan losslessly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ev-mig-'));
  try {
    const plan = await createPlan({ slug: 'ev-mig', goal: 'g', tasklist: minimalTasklist(), tier: 'internal-tool', rootDir: dir, ts: '2026-01-01T00:00:00.000Z' });
    assert.deepEqual(plan.artifacts.round_trips, [], 'fresh plan starts with an empty round-trip channel');
    const ledgerPath = join(dir, '.claude/state/ev-mig/ledger.json');

    const updated = recordRoundTripOnPlan({ slug: 'ev-mig', rootDir: dir, ledgerPath, roundTrip: RT });

    // Projection (graduation-gate's read path) still holds the round-trip.
    assert.deepEqual(readLedger(ledgerPath).round_trips, [RT], 'projection holds the round-trip');
    // Mirrored into the plan losslessly + persisted.
    assert.ok(updated, 'returns the updated plan when mirrored');
    assert.deepEqual(updated.artifacts.round_trips, [RT], 'round-trip mirrored into plan.artifacts');
    assert.deepEqual(readPlan('ev-mig', dir).artifacts.round_trips, [RT], 'plan persisted with the round-trip');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-007 back-compat: no plan on disk → projection only, returns null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ev-mig-nop-'));
  try {
    const ledgerPath = join(dir, '.claude/state/none/ledger.json');
    const result = recordRoundTripOnPlan({ slug: 'none', rootDir: dir, ledgerPath, roundTrip: RT });
    assert.equal(result, null, 'no plan → null (identical to appendRoundTrip)');
    assert.deepEqual(readLedger(ledgerPath).round_trips, [RT], 'projection written even without a plan');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
