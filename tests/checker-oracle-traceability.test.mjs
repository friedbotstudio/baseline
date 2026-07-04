// spec-traceability-review oracle — AC-002 (dropped upstream AC -> BLOCKER w/ trace-gap artifact)
// + AC-007 (erp-portables slice G): two-sided faithful scope — an AC row deferring
//   spec-committed scope must carry a closed-list reason tag (`deferred: dependency|
//   risk|cost|human-directed`); untagged or YAGNI-tagged deferral -> Critical BLOCKER.
// SUT: .claude/skills/spec-traceability-review/oracle.mjs (not yet built -> RED).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// AC-007 — deferral-tag discipline on spec AC-table rows (erp-portables slice G).
// Row convention: a row deferring spec-committed scope writes `deferred: <reason>`
// in its Criterion cell; the closed reason list is dependency|risk|cost|human-directed.

const deferralSpec = (criterion) => [
  '## Acceptance criteria',
  '| ID | Criterion | Upstream | Sequence |',
  '|---|---|---|---|',
  '| AC-001 | x | intake AC 1 | §Behavior #1 |',
  `| AC-002 | ${criterion} | intake AC 2 | §Behavior #2 |`,
  '| AC-003 | z | intake AC 3 | §Behavior #3 |',
].join('\n');

const deferralFindings = (findings) => findings.filter((f) => f.check === 'deferral_tagged');

describe('spec-traceability-review oracle — deferral tags (AC-007)', () => {
  it('test_when_ac_row_defers_with_closed_list_tag_then_no_deferral_finding', async () => {
    const { runTraceabilityOracle } = await import(SUT);
    for (const reason of ['dependency', 'risk', 'cost', 'human-directed']) {
      const { findings } = runTraceabilityOracle(
        { spec: deferralSpec(`deferred: ${reason} — lands with slice J2`), intake },
        { tierDial: mandatoryDial },
      );
      assert.equal(deferralFindings(findings).length, 0,
        `\`deferred: ${reason}\` is a sanctioned closed-list tag and must pass`);
    }
  });

  it('test_when_ac_row_defers_untagged_then_critical_blocker', async () => {
    const { runTraceabilityOracle } = await import(SUT);
    const { findings } = runTraceabilityOracle(
      { spec: deferralSpec('deferred to a later slice'), intake },
      { tierDial: mandatoryDial },
    );
    const hits = deferralFindings(findings);
    assert.equal(hits.length, 1, 'an untagged deferral must be reported exactly once');
    assert.equal(hits[0].severity, 'BLOCKER', 'untagged deferral is a Critical BLOCKER');
    assert.ok(hits[0].artifact && hits[0].artifact.kind === 'deferral',
      'BLOCKER carries a deferral ArtifactRef');
    assert.match(hits[0].artifact.locus, /AC-002/, 'locus names the deferring AC row');
  });

  it('test_when_ac_row_defers_yagni_tagged_then_critical_blocker', async () => {
    const { runTraceabilityOracle } = await import(SUT);
    const { findings } = runTraceabilityOracle(
      { spec: deferralSpec('deferred: YAGNI'), intake },
      { tierDial: mandatoryDial },
    );
    const hits = deferralFindings(findings);
    assert.equal(hits.length, 1, 'a YAGNI-tagged deferral must be reported');
    assert.equal(hits[0].severity, 'BLOCKER',
      'YAGNI never authorizes deferring spec-committed scope — Critical BLOCKER');
    assert.match(hits[0].artifact.locus, /AC-002/);
  });
});

describe('constitution chain — VI.4 floor/ceiling note (AC-007)', () => {
  const NOTE = 'never authorizes deferring spec-committed scope';
  for (const rel of ['CLAUDE.md', 'src/CLAUDE.template.md', 'docs/init/seed.md', 'src/seed.template.md']) {
    it(`test_when_constitution_read_then_vi4_floor_ceiling_note_present_${rel.replace(/[^\w]/g, '_')}`, () => {
      const text = readFileSync(path.join(ROOT, rel), 'utf8');
      assert.ok(text.includes(NOTE),
        `${rel} must carry the VI.4 floor/ceiling sentence ("YAGNI gates speculation beyond the approved spec; it ${NOTE}.")`);
    });
  }
});
