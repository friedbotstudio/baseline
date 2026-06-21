// checker-fanout — AC-007 (parallel == serial byte-identical) + AC-009 (LLM-agent fan-out rejected pre-rewrite)
// SUT: .claude/skills/harness/checker-fanout.mjs (not yet built -> RED).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/harness/checker-fanout.mjs');

// Four per-checker verdicts, deliberately unsorted, with findings out of order.
const verdicts = [
  { checker: 'spec-traceability', findings: [{ check: 'upstream_ac_traced', severity: 'ADVISORY' }] },
  { checker: 'spec-lint', findings: [{ check: 'ac_traceability', severity: 'BLOCKER' }] },
  { checker: 'spec-diagram', findings: [] },
  { checker: 'spec-shippability', findings: [{ check: 'C1', severity: 'ADVISORY' }] },
];

describe('checker-fanout (AC-007, AC-009)', () => {
  it('test_when_fanout_parallel_vs_serial_then_byte_identical_verdict', async () => {
    const { mergeVerdicts } = await import(SUT);
    const a = JSON.stringify(mergeVerdicts(verdicts));
    const b = JSON.stringify(mergeVerdicts([...verdicts].reverse()));
    assert.equal(a, b, 'merge is order-independent (deterministic) -> parallel==serial');
  });

  it('test_when_merge_has_blocker_then_verdict_blocked', async () => {
    const { mergeVerdicts } = await import(SUT);
    const merged = mergeVerdicts(verdicts);
    assert.equal(merged.verdict, 'BLOCKED', 'any BLOCKER finding -> BLOCKED verdict');
  });

  it('test_when_llm_agent_fanout_attempted_pre_rewrite_then_rejected', async () => {
    const { assertFanoutAllowed } = await import(SUT);
    assert.throws(
      () => assertFanoutAllowed({ mode: 'agents', amendmentPresent: false }),
      /clause 6|fan-out not permitted/i,
      'LLM-agent fan-out must be rejected while the clause-6 amendment is absent',
    );
  });

  it('test_when_script_fanout_then_always_allowed', async () => {
    const { assertFanoutAllowed } = await import(SUT);
    assert.doesNotThrow(() => assertFanoutAllowed({ mode: 'scripts', amendmentPresent: false }));
  });
});
