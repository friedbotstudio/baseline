// Governance — the conditional/process ACs of checker-graduation-fanout that the
// graduation execution + amendment made concrete:
//   AC-006 — the -9360 Article II amendment landed (seed.md §II.A clause 6 lifts the
//            fan-out cap for oracle-bound checkers; CLAUDE.md mirrors it; templates byte-equal).
//   AC-008 — honest-stop precondition: a false-positive block makes the gate fail, the
//            condition under which the amendment must NOT apply.
//   AC-004 — security-clean is a mechanically-required gate input (the /security verdict
//            gates graduation; the formal Phase-8 review is the human-judgment deliverable).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

describe('checker-graduation-fanout amendment + conditional ACs', () => {
  it('test_when_amendment_landed_then_seed_and_claude_permit_oracle_fanout', () => {
    // AC-006
    const seed = read('docs/init/seed.md');
    assert.match(seed, /oracle-bound read-only checkers[\s\S]*fan out/i,
      'seed.md §II.A clause 6 must permit oracle-bound checker fan-out');
    assert.match(seed, /Graduation gate — MET for oracle-bound checkers/i,
      'seed.md §II.A clause 7 must record the graduation as met');
    const claude = read('CLAUDE.md');
    assert.match(claude, /oracle-bound read-only checkers may fan out/i,
      'CLAUDE.md Article II must carry the §II.A fan-out pointer');
  });

  it('test_when_claude_md_then_byte_equal_to_template', () => {
    // AC-006 — mirror integrity
    assert.equal(read('CLAUDE.md'), read('src/CLAUDE.template.md'),
      'CLAUDE.md must be byte-equal to its src mirror after the amendment');
    assert.ok(Buffer.byteLength(read('CLAUDE.md'), 'utf8') <= 40000,
      'CLAUDE.md must stay within the 40000-char hard cap');
  });

  it('test_when_fp_block_then_gate_fails_so_amendment_withheld', async () => {
    // AC-008 — honest-stop precondition
    const { evaluateGate } = await import(path.join(ROOT, '.claude/skills/harness/graduation-gate.mjs'));
    const ledger = { round_trips: [
      { id: 1, false_positive_blocks: 0 },
      { id: 2, false_positive_blocks: 1 },
      { id: 3, false_positive_blocks: 0 },
    ] };
    assert.equal(evaluateGate({ ledger, securityClean: true }).pass, false,
      'a false-positive block must fail the gate — the amendment must not apply on that path');
  });

  it('test_when_security_not_clean_then_gate_fails', async () => {
    // AC-004 — security-clean is a required graduation input
    const { evaluateGate } = await import(path.join(ROOT, '.claude/skills/harness/graduation-gate.mjs'));
    const clean3 = { round_trips: [
      { id: 1, false_positive_blocks: 0 },
      { id: 2, false_positive_blocks: 0 },
      { id: 3, false_positive_blocks: 0 },
    ] };
    assert.equal(evaluateGate({ ledger: clean3, securityClean: false }).pass, false,
      'security not clean must fail the gate (AC-004 is a mechanical gate input)');
  });
});
