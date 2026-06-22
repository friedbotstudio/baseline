// spec-rollout-enforceability oracle (-419d / Q-002) — mechanical check that every
// structured Rollout prerequisite binds to an enforcement-type AC. A missing /
// dangling / non-enforcing `enforced-by` is a concrete artifact, so it BLOCKs under
// the proof-obligation contract; a precondition left in free prose is ADVISORY.
//
// Deterministic: the tierDial is injected so BLOCKER emission does not depend on the
// live project.json — mirrors checker-oracle-diagram.test.mjs / -traceability.test.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runRolloutOracle } from '../.claude/skills/spec-rollout-enforceability-review/oracle.mjs';
import { resolveCheckerThreshold } from '../.claude/hooks/lib/tier-dial.mjs';

const MANDATORY = { tierDial: () => ({ mandatory: true }) };
const ADVISORY_ONLY = { tierDial: () => ({ mandatory: false }) };

// Build a minimal spec fixture: an AC table (id|criterion|Kind|...) plus either a
// structured ### Prerequisites table or free-prose Rollout bullets.
function buildSpec({ prereqRows, acRows, freeprose }) {
  const ac = [
    '## Acceptance criteria',
    '',
    '| ID | Criterion | Kind | Upstream AC | Sequence |',
    '|---|---|---|---|---|',
    ...acRows.map((a) => `| ${a.id} | does a thing | ${a.kind} | intake AC 1 | §Behavior #1 |`),
    '',
  ].join('\n');

  let rollout;
  if (prereqRows) {
    rollout = [
      '## Rollout',
      '',
      '### Prerequisites',
      '',
      '| # | Prerequisite | enforced-by |',
      '|---|---|---|',
      ...prereqRows.map((r, i) => `| ${i + 1} | ${r.text} | ${r.enforcedBy} |`),
      '',
    ].join('\n');
  } else {
    rollout = ['## Rollout', '', ...(freeprose || []), ''].join('\n');
  }
  return `${ac}\n${rollout}\n`;
}

const bySeverity = (findings, sev) => findings.filter((f) => f.severity === sev);

describe('runRolloutOracle — structured prerequisite binding', () => {
  it('test_when_prereq_bound_to_preflight_ac_then_clean', () => {
    const spec = buildSpec({
      prereqRows: [{ text: 'Pages build_type must equal workflow', enforcedBy: 'AC-009' }],
      acRows: [{ id: 'AC-009', kind: 'preflight' }],
    });
    const { findings } = runRolloutOracle({ specContent: spec }, MANDATORY);
    assert.equal(findings.length, 0, 'a bound prerequisite yields no findings');
  });

  it('test_when_enforced_by_empty_then_blocker_missing', () => {
    const spec = buildSpec({
      prereqRows: [{ text: 'Pages build_type', enforcedBy: '' }],
      acRows: [{ id: 'AC-009', kind: 'preflight' }],
    });
    const { findings } = runRolloutOracle({ specContent: spec }, MANDATORY);
    const blockers = bySeverity(findings, 'BLOCKER');
    assert.equal(blockers.length, 1, 'one BLOCKER for the empty enforced-by row');
    assert.equal(blockers[0].check, 'missing_enforced_by');
  });

  it('test_when_enforced_by_unknown_ac_then_blocker_dangling', () => {
    // covers AC-003 (dangling enforced-by pointer)
    const spec = buildSpec({
      prereqRows: [{ text: 'Pages build_type', enforcedBy: 'AC-099' }],
      acRows: [{ id: 'AC-009', kind: 'preflight' }],
    });
    const { findings } = runRolloutOracle({ specContent: spec }, MANDATORY);
    const blockers = bySeverity(findings, 'BLOCKER');
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].check, 'dangling_enforced_by');
  });

  it('test_when_enforced_by_behavior_kind_then_blocker_non_enforcement', () => {
    // covers AC-004 (enforced-by resolves to a non-enforcement-Kind AC)
    const spec = buildSpec({
      prereqRows: [{ text: 'Pages build_type', enforcedBy: 'AC-001' }],
      acRows: [{ id: 'AC-001', kind: 'behavior' }],
    });
    const { findings } = runRolloutOracle({ specContent: spec }, MANDATORY);
    const blockers = bySeverity(findings, 'BLOCKER');
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].check, 'non_enforcement_kind');
  });

  it('test_when_prereq_only_freeprose_then_advisory', () => {
    // covers AC-005 (free-prose prerequisite is ADVISORY, never BLOCKER)
    const spec = buildSpec({
      freeprose: ['- **Prerequisite**: Pages build_type must equal workflow'],
      acRows: [{ id: 'AC-009', kind: 'preflight' }],
    });
    const { findings } = runRolloutOracle({ specContent: spec }, MANDATORY);
    assert.equal(bySeverity(findings, 'BLOCKER').length, 0, 'free prose never blocks');
    assert.equal(bySeverity(findings, 'ADVISORY').length, 1, 'one advisory to structure it');
  });

  it('test_when_no_prerequisites_table_then_no_findings', () => {
    const spec = buildSpec({
      freeprose: ['- **Feature flag**: rollout.flag — default off', '- **Canary**: none'],
      acRows: [{ id: 'AC-001', kind: 'behavior' }],
    });
    const { findings } = runRolloutOracle({ specContent: spec }, MANDATORY);
    assert.equal(findings.length, 0, 'a Rollout with no prerequisite cue and no table is clean');
  });

  it('test_when_multiple_prereqs_all_bound_then_clean', () => {
    const spec = buildSpec({
      prereqRows: [
        { text: 'Pages build_type', enforcedBy: 'AC-009' },
        { text: 'manifest rebuilt', enforcedBy: 'AC-008' },
      ],
      acRows: [
        { id: 'AC-008', kind: 'smoke' },
        { id: 'AC-009', kind: 'preflight' },
      ],
    });
    const { findings } = runRolloutOracle({ specContent: spec }, MANDATORY);
    assert.equal(findings.length, 0);
  });

  it('test_when_missing_enforced_by_but_not_mandatory_then_advisory_not_blocker', () => {
    // Severity must be tier-gated: the same defect downgrades to ADVISORY when the
    // checker is not mandatory (the normalizeFinding contract).
    const spec = buildSpec({
      prereqRows: [{ text: 'Pages build_type', enforcedBy: '' }],
      acRows: [{ id: 'AC-009', kind: 'preflight' }],
    });
    const { findings } = runRolloutOracle({ specContent: spec }, ADVISORY_ONLY);
    assert.equal(bySeverity(findings, 'BLOCKER').length, 0);
    assert.equal(bySeverity(findings, 'ADVISORY').length, 1);
  });
});

describe('tier-dial registration — spec-rollout is mandatory', () => {
  for (const level of ['internal-tool', 'customer-data', 'regulated']) {
    it(`test_when_resolve_spec_rollout_threshold_under_${level}_then_mandatory_true`, () => {
      const t = resolveCheckerThreshold('spec-rollout', { projectJson: { tier: { level } } });
      assert.equal(t.mandatory, true, `spec-rollout must be mandatory under ${level}`);
    });
  }
});
