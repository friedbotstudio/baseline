import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Helpers do not exist yet — these imports fail RED until /implement writes them.
import { isSprintModeEnabled } from '../.claude/skills/sprint-dispatch/sprint-mode.mjs';
import { selectPeerClass } from '../.claude/skills/sprint-dispatch/peer-select.mjs';
import { recordYield, recordArbitration } from '../.claude/skills/sprint-dispatch/yield-arbiter.mjs';
// Real plan-store (no mocks) — yield-arbiter records onto the durable plan lineage.
import { createPlan } from '../.claude/skills/harness/plan-store.mjs';

test('test_when_sprint_mode_flag_absent_then_disabled', () => {
  assert.equal(isSprintModeEnabled({}), false);
  assert.equal(isSprintModeEnabled({ velocity: {} }), false);
  assert.equal(isSprintModeEnabled({ velocity: { sprint_mode: { enabled: false } } }), false);
});

test('test_when_sprint_mode_flag_true_then_enabled', () => {
  assert.equal(isSprintModeEnabled({ velocity: { sprint_mode: { enabled: true } } }), true);
});

test('test_when_sessions_registered_then_peer_class_session', () => {
  assert.equal(selectPeerClass({ peers: [{ peer_id: 's1', pclass: 'session' }] }), 'session');
});

test('test_when_no_sessions_then_peer_class_worker', () => {
  assert.equal(selectPeerClass({ peers: [] }), 'worker');
  assert.equal(selectPeerClass({ peers: [{ peer_id: 'w1', pclass: 'worker' }] }), 'worker');
});

test('test_when_worker_yields_fork_then_plan_revision_recorded', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'sd-yield-'));
  try {
    const plan = await createPlan({ slug: 'sd-test', goal: 'g', tasklist: [], tier: 'standard', rootDir });
    assert.equal(plan.versions.length, 1);
    const updated = await recordYield(plan, { task_id: 'T3', fork_desc: 'which lib', peer_id: 'pA' });
    assert.equal(updated.versions.length, 2, 'a yield appends exactly one revision');
    const rev = updated.versions[updated.versions.length - 1];
    assert.equal(rev.author, 'pA', 'the yielding peer is the revision author');
    assert.match(rev.reason, /which lib|fork|yield/i);
  } finally { rmSync(rootDir, { recursive: true, force: true }); }
});

test('test_when_yield_arbitrated_then_resolution_recorded_and_redispatchable', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'sd-arb-'));
  try {
    const plan = await createPlan({ slug: 'sd-test', goal: 'g', tasklist: [], tier: 'standard', rootDir });
    const yielded = await recordYield(plan, { task_id: 'T3', fork_desc: 'which lib', peer_id: 'pA' });
    const arbitrated = await recordArbitration(yielded, { task_id: 'T3', resolution: 'use stdlib' });
    assert.ok(arbitrated.versions.length > yielded.versions.length, 'arbitration appends a further revision');
    const rev = arbitrated.versions[arbitrated.versions.length - 1];
    assert.equal(rev.author, 'lead', 'the lead arbitrates in main context');
    assert.match(rev.reason, /arbitr|resolv|use stdlib/i);
  } finally { rmSync(rootDir, { recursive: true, force: true }); }
});
