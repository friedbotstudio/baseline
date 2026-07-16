// Tests for gate-collapse-resolver.mjs — the class-off degrade (D-5, AC-003).
//
// The 3->2 base collapse ships ON by default. The 2->1 single-authorization
// further collapse activates ONLY when governance.class.enabled === true AND the
// workflow's Governance Class is low ({D,C}). With the flag off (today's default)
// or a high class ({A,B}), the resolver returns the two-gate flow — never one.
//
// FAILS until .claude/skills/harness/gate-collapse-resolver.mjs exists exporting
// resolveGateCollapse({ projectJson, governanceClass }).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { resolveGateCollapse } = await import(path.join(REPO_ROOT, '.claude/skills/harness/gate-collapse-resolver.mjs'));

describe('gate-collapse-resolver — class-off degrade (AC-003)', () => {
  it('test_when_class_flag_off_then_two_gates', () => {
    const r = resolveGateCollapse({ projectJson: {}, governanceClass: null });
    assert.equal(r.mode, 'two-gate');
    assert.deepEqual(r.gates, ['approve-direction', 'approve-landing']);
  });

  it('test_when_class_flag_absent_key_then_two_gates', () => {
    const r = resolveGateCollapse({ projectJson: { governance: {} }, governanceClass: { class: 'D' } });
    assert.equal(r.mode, 'two-gate', 'absent enabled key must fail off → two gates');
  });

  it('test_when_class_flag_on_class_D_then_single_authorization', () => {
    const r = resolveGateCollapse({ projectJson: { governance: { class: { enabled: true } } }, governanceClass: { class: 'D' } });
    assert.equal(r.mode, 'single-auth');
    assert.equal(r.gates.length, 1);
  });

  it('test_when_class_flag_on_class_C_then_single_authorization', () => {
    const r = resolveGateCollapse({ projectJson: { governance: { class: { enabled: true } } }, governanceClass: { class: 'C' } });
    assert.equal(r.mode, 'single-auth');
  });

  it('test_when_class_flag_on_class_A_then_two_gates', () => {
    const r = resolveGateCollapse({ projectJson: { governance: { class: { enabled: true } } }, governanceClass: { class: 'A' } });
    assert.equal(r.mode, 'two-gate', 'high class keeps both human gates');
  });

  it('test_when_class_flag_on_class_B_then_two_gates', () => {
    const r = resolveGateCollapse({ projectJson: { governance: { class: { enabled: true } } }, governanceClass: { class: 'B' } });
    assert.equal(r.mode, 'two-gate');
  });

  it('test_when_class_flag_on_but_no_class_resolved_then_two_gates', () => {
    const r = resolveGateCollapse({ projectJson: { governance: { class: { enabled: true } } }, governanceClass: null });
    assert.equal(r.mode, 'two-gate', 'flag on but class unresolved → fail-safe two gates');
  });
});
