// graduation-gate — AC-005 (fail-CLOSED counts-only: >=3 round_trips AND 0 fp-blocks AND security_clean)
// SUT: .claude/skills/harness/graduation-gate.mjs (not yet built -> RED).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/harness/graduation-gate.mjs');

const clean3 = {
  round_trips: [
    { id: 1, false_positive_blocks: 0 },
    { id: 2, false_positive_blocks: 0 },
    { id: 3, false_positive_blocks: 0 },
  ],
};

describe('graduation-gate (AC-005, fail-closed)', () => {
  it('test_when_gate_eval_missing_ledger_then_pass_false', async () => {
    const { evaluateGate } = await import(SUT);
    const r = evaluateGate({ ledger: null, securityClean: true });
    assert.equal(r.pass, false, 'missing/malformed ledger -> fail-closed');
  });

  it('test_when_gate_eval_one_fp_block_then_pass_false', async () => {
    const { evaluateGate } = await import(SUT);
    const ledger = { round_trips: [
      { id: 1, false_positive_blocks: 0 },
      { id: 2, false_positive_blocks: 1 },
      { id: 3, false_positive_blocks: 0 },
    ] };
    const r = evaluateGate({ ledger, securityClean: true });
    assert.equal(r.pass, false, 'any false-positive block fails the gate');
  });

  it('test_when_gate_eval_three_clean_and_security_clean_then_pass_true', async () => {
    const { evaluateGate } = await import(SUT);
    const r = evaluateGate({ ledger: clean3, securityClean: true });
    assert.equal(r.pass, true);
    assert.equal(r.round_trips, 3);
    assert.equal(r.false_positive_blocks, 0);
  });

  it('test_when_gate_eval_security_not_clean_then_pass_false', async () => {
    const { evaluateGate } = await import(SUT);
    const r = evaluateGate({ ledger: clean3, securityClean: false });
    assert.equal(r.pass, false, 'security not clean -> gate fails even with clean round-trips');
  });

  it('test_when_gate_eval_two_roundtrips_then_pass_false', async () => {
    const { evaluateGate } = await import(SUT);
    const r = evaluateGate({ ledger: { round_trips: clean3.round_trips.slice(0, 2) }, securityClean: true });
    assert.equal(r.pass, false, 'fewer than 3 round-trips fails');
  });
});
