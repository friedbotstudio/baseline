// spec-traceability-review oracle — AC-002 (dropped upstream AC -> BLOCKER w/ trace-gap artifact)
// SUT: .claude/skills/spec-traceability-review/oracle.mjs (not yet built -> RED).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/spec-traceability-review/oracle.mjs');

const intake = [
  '## Acceptance criteria',
  '1. given a, when b, then c',
  '2. given d, when e, then f',
  '3. given g, when h, then i',
].join('\n');

// spec AC table traces intake AC 1 and 2 but silently drops intake AC 3.
const specDropsAc3 = [
  '## Acceptance criteria',
  '| ID | Criterion | Upstream | Sequence |',
  '|---|---|---|---|',
  '| AC-001 | x | intake AC 1 | §Behavior #1 |',
  '| AC-002 | y | intake AC 2 | §Behavior #2 |',
].join('\n');

const specTracesAll = specDropsAc3 + '\n| AC-003 | z | intake AC 3 | §Behavior #3 |';

const mandatoryDial = () => ({ floor: 0, mandatory: true });

describe('spec-traceability-review oracle (AC-002)', () => {
  it('test_when_trace_oracle_drops_intake_ac_then_blocker_with_tracegap_artifact', async () => {
    const { runTraceabilityOracle } = await import(SUT);
    const { findings } = runTraceabilityOracle({ spec: specDropsAc3, intake }, { tierDial: mandatoryDial });
    const gap = findings.find((f) => f.check === 'upstream_ac_traced');
    assert.ok(gap, 'a dropped upstream AC must be reported');
    assert.equal(gap.severity, 'BLOCKER');
    assert.ok(gap.artifact && gap.artifact.kind === 'trace-gap', 'BLOCKER carries a trace-gap ArtifactRef');
    assert.match(gap.artifact.locus, /3/, 'locus names the dropped intake AC');
  });

  it('test_when_trace_oracle_all_traced_then_clean', async () => {
    const { runTraceabilityOracle } = await import(SUT);
    const { findings } = runTraceabilityOracle({ spec: specTracesAll, intake }, { tierDial: mandatoryDial });
    assert.equal(findings.filter((f) => f.check === 'upstream_ac_traced').length, 0);
  });

  it('test_when_spec_uses_hyphenated_ac_refs_then_clean', async () => {
    // Real specs write "intake AC-1" (hyphen) and zero-padded "intake AC-001";
    // a space-only matcher false-flagged these. Regression for that false positive.
    const { runTraceabilityOracle } = await import(SUT);
    const hyphenSpec = [
      '## Acceptance criteria',
      '| ID | Criterion | Upstream | Sequence |',
      '|---|---|---|---|',
      '| AC-001 | x | intake AC-1 | §Behavior #1 |',
      '| AC-002 | y | intake AC-002 | §Behavior #2 |',
      '| AC-003 | z | intake AC 3 | §Behavior #3 |',
    ].join('\n');
    const { findings } = runTraceabilityOracle({ spec: hyphenSpec, intake }, { tierDial: mandatoryDial });
    assert.equal(findings.filter((f) => f.check === 'upstream_ac_traced').length, 0,
      'hyphenated and zero-padded "intake AC-N" references must count as traced');
  });
});
