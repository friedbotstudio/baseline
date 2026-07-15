// A1 — Governance Class classifier. RED until tier-dial.mjs gains classFloor +
// raiseClass and governance-class.mjs gains extractSignals.
// Covers: AC-101 (deterministic floor derivation), AC-102 (raise-only), AC-103
// (bad-config fallback, no throw).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIAL = join(REPO_ROOT, '.claude/hooks/lib/tier-dial.mjs');
const GC = join(REPO_ROOT, '.claude/skills/triage/governance-class.mjs');

describe('A1 classFloor / raiseClass', () => {
  it('test_when_hook_touching_change_internal_tool_then_class_at_least_C', async () => {
    const { classFloor, GOVERNANCE_CLASSES } = await import(DIAL);
    const r1 = classFloor({ hookOrGovernance: true }, { projectJson: { tier: { level: 'internal-tool' } } });
    const r2 = classFloor({ hookOrGovernance: true }, { projectJson: { tier: { level: 'internal-tool' } } });
    assert.ok(GOVERNANCE_CLASSES.indexOf(r1.floor) >= GOVERNANCE_CLASSES.indexOf('C'), `floor ${r1.floor} >= C`);
    assert.equal(r1.class, r1.floor);
    assert.deepEqual(r1, r2, 'deterministic: identical input -> identical output');
    assert.equal(r1.source, 'floor');
  });

  it('test_when_consent_adjacent_then_floor_A', async () => {
    const { classFloor } = await import(DIAL);
    const r = classFloor({ consentAdjacent: true }, { projectJson: { tier: { level: 'internal-tool' } } });
    assert.equal(r.floor, 'A');
  });

  it('test_when_sensitive_surface_then_floor_at_least_B', async () => {
    const { classFloor, GOVERNANCE_CLASSES } = await import(DIAL);
    const r = classFloor({ sensitiveSurface: true }, { projectJson: { tier: { level: 'internal-tool' } } });
    assert.ok(GOVERNANCE_CLASSES.indexOf(r.floor) >= GOVERNANCE_CLASSES.indexOf('B'));
  });

  it('test_when_raiseClass_C_A_then_A', async () => {
    const { raiseClass } = await import(DIAL);
    assert.equal(raiseClass('C', 'A'), 'A');
  });

  it('test_when_raiseClass_A_D_then_A_clamped', async () => {
    const { raiseClass } = await import(DIAL);
    assert.equal(raiseClass('A', 'D'), 'A', 'never lowers below floor');
  });

  it('test_when_classFloor_bad_project_json_then_tier_fallback_no_throw', async () => {
    const { classFloor } = await import(DIAL);
    assert.doesNotThrow(() => classFloor({}, { projectJson: null }));
    const r1 = classFloor({}, { projectJson: null });
    const r2 = classFloor({}, { projectJson: 'not-an-object' });
    assert.equal(r1.tier, 'internal-tool');
    assert.equal(r1.class, 'D');
    assert.equal(r2.class, 'D');
  });
});

describe('A1 extractSignals', () => {
  it('test_when_extractSignals_hooks_path_then_hookOrGovernance', async () => {
    const { extractSignals } = await import(GC);
    const s = extractSignals({ writeSet: ['.claude/hooks/lib/tier-dial.mjs'], project: {} });
    assert.equal(s.hookOrGovernance, true);
    assert.equal(s.fileCount, 1);
  });

  it('test_when_extractSignals_consent_path_then_consentAdjacent', async () => {
    const { extractSignals } = await import(GC);
    const s = extractSignals({ writeSet: ['.claude/hooks/spec_approval_guard.mjs', '.claude/state/commit_consent'], project: {} });
    assert.equal(s.consentAdjacent, true);
  });

  it('test_when_extractSignals_empty_then_all_false', async () => {
    const { extractSignals } = await import(GC);
    const s = extractSignals({ writeSet: [], project: {} });
    assert.equal(s.consentAdjacent, false);
    assert.equal(s.sensitiveSurface, false);
    assert.equal(s.hookOrGovernance, false);
    assert.equal(s.fileCount, 0);
  });
});
