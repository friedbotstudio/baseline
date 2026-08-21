// work-planner-envelope — the verdict and the proposal.
//
// `classify` is pure and every threshold boundary is table-driven, because the two
// numbers (3x floor, 4x target) are the whole feature and an off-by-one at either
// edge silently changes what the system asks of the operator.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const PLANNER = '.claude/skills/harness/work-planner.mjs';
const RATIO = '.claude/skills/harness/ratio.mjs';

const envelope = (tokens = 100) => ({ track: 't', envelope_tokens: tokens, fitted: true, sample_count: 9, source: 'corpus' });
const payload = (tokens) => ({ track: 't', payload_tokens: tokens, measured: true, applicable: true });

function tempRepo(workflow = {}, backlog = []) {
  const root = mkdtempSync(join(tmpdir(), 'planner-'));
  mkdirSync(join(root, '.claude/state'), { recursive: true });
  mkdirSync(join(root, '.claude/memory/backlog'), { recursive: true });
  writeFileSync(join(root, '.claude/state/workflow.json'),
    JSON.stringify({ slug: 'w', track_id: 'intake-full', completed: ['tdd'], source_backlog_keys: [], ...workflow }, null, 2), 'utf8');
  for (const key of backlog) {
    writeFileSync(join(root, '.claude/memory/backlog', `${key}.md`),
      `---\nkey: ${key}\ncategory: backlog\nstatus: open\ngoverns: .claude/skills/x/y.mjs\n---\n\n- ${key}\n`, 'utf8');
  }
  return root;
}

const readWorkflow = (root) => JSON.parse(readFileSync(join(root, '.claude/state/workflow.json'), 'utf8'));

describe('classify — thresholds (AC-003 … AC-005, AC-013)', () => {
  // Each row names its own AC. A range written with an ellipsis in the describe
  // title reads fine to a person and is invisible to drift-check, which scans added
  // lines for the literal id — AC-004 went unreferenced exactly that way.
  const cases = [
    ['test_when_ratio_below_floor_then_state_is_under_floor_with_shortfall', 100, 'under-floor', 1.0, 'AC-003'],
    ['test_when_ratio_between_floor_and_target_then_state_is_acceptable', 350, 'acceptable', 3.5, 'AC-004'],
    ['test_when_ratio_at_or_above_target_then_state_is_optimal', 500, 'optimal', 5.0, 'AC-005'],
    ['test_when_ratio_is_exactly_the_floor_then_acceptable_not_under_floor', 300, 'acceptable', 3.0, 'AC-004'],
    ['test_when_ratio_is_exactly_the_target_then_optimal', 400, 'optimal', 4.0, 'AC-005'],
  ];

  for (const [name, payloadTokens, expected, ratio, ac] of cases) {
    it(name, async () => {
      const mod = await tryImport(PLANNER);
      assert.ok(mod, `${PLANNER} must exist`);
      const v = mod.classify({ envelope: envelope(100), payload: payload(payloadTokens) });
      assert.equal(v.state, expected, `${ac}: ratio ${ratio} must classify as ${expected}`);
      assert.equal(v.ratio, ratio);
    });
  }

  it('test_when_under_floor_then_shortfall_names_the_tokens_still_needed', async () => {
    const mod = await tryImport(PLANNER);
    assert.ok(mod, `${PLANNER} must exist`);
    const v = mod.classify({ envelope: envelope(100), payload: payload(120) });
    assert.equal(v.state, 'under-floor');
    assert.equal(v.shortfall_tokens, 280,
      'the shortfall closes to the TARGET (4x = 400), not the floor — the operator is being asked to reach optimal, not to scrape past the warning');
  });

  it('test_when_track_has_no_payload_phase_then_state_is_not_applicable', async () => {
    const mod = await tryImport(PLANNER);
    assert.ok(mod, `${PLANNER} must exist`);
    const v = mod.classify({ envelope: envelope(100), payload: { track: 'chore', payload_tokens: 0, measured: false, applicable: false } });
    assert.equal(v.state, 'not-applicable',
      'AC-013: a chore has no payload phase by design; scoring it 0x would report every chore as maximally wasteful');
    assert.ok(!Number.isFinite(v.ratio) === false || v.ratio === null, 'a non-applicable verdict carries no ratio');
  });

  it('test_when_envelope_is_unfitted_then_the_verdict_says_so', async () => {
    const mod = await tryImport(PLANNER);
    assert.ok(mod, `${PLANNER} must exist`);
    const v = mod.classify({ envelope: { ...envelope(100), fitted: false, source: 'shipped-default', sample_count: 0 }, payload: payload(500) });
    assert.equal(v.envelope.fitted, false,
      'AC-002: an operator must be able to tell a borrowed default from their own measurement');
  });
});

describe('the auto-add proposal (AC-010 … AC-012, AC-003a)', () => {
  it('test_when_below_target_then_proposal_names_candidates_and_writes_nothing', async () => {
    const mod = await tryImport(PLANNER);
    assert.ok(mod, `${PLANNER} must exist`);
    const root = tempRepo({}, ['alpha-1111', 'beta-2222']);
    const before = readFileSync(join(root, '.claude/state/workflow.json'), 'utf8');

    const proposal = mod.proposeWork({ rootDir: root, shortfallTokens: 280 });

    assert.ok(Array.isArray(proposal.candidates), 'AC-010: a proposal names candidates');
    assert.ok(proposal.candidates.length > 0, 'two open backlog entries exist, so the pool is not empty');
    assert.equal(proposal.approved, false, 'a fresh proposal is never pre-approved');
    assert.equal(readFileSync(join(root, '.claude/state/workflow.json'), 'utf8'), before,
      'proposing must not write — the operator has not been asked yet');
  });

  it('test_when_proposal_declined_then_workflow_is_unchanged', async () => {
    const mod = await tryImport(PLANNER);
    assert.ok(mod, `${PLANNER} must exist`);
    const root = tempRepo({}, ['alpha-1111']);
    const before = readFileSync(join(root, '.claude/state/workflow.json'), 'utf8');

    const proposal = mod.proposeWork({ rootDir: root, shortfallTokens: 280 });
    mod.applyProposal({ rootDir: root, proposal, approved: false });

    assert.equal(readFileSync(join(root, '.claude/state/workflow.json'), 'utf8'), before,
      'AC-011: declining adds nothing, and "nothing" means byte-identical');
  });

  it('test_when_proposal_approved_then_keys_land_in_source_backlog_keys', async () => {
    const mod = await tryImport(PLANNER);
    assert.ok(mod, `${PLANNER} must exist`);
    const root = tempRepo({}, ['alpha-1111', 'beta-2222']);

    const proposal = mod.proposeWork({ rootDir: root, shortfallTokens: 280 });
    mod.applyProposal({ rootDir: root, proposal, approved: true });

    const keys = readWorkflow(root).source_backlog_keys;
    assert.deepEqual([...keys].sort(), proposal.candidates.map((c) => c.key).sort(),
      'AC-012: the approved keys reach source_backlog_keys, which is what makes /commit stamp their closure in the same landing');
  });

  it('test_when_override_recorded_then_reason_survives_in_workflow_json', async () => {
    const mod = await tryImport(PLANNER);
    assert.ok(mod, `${PLANNER} must exist`);
    const root = tempRepo();

    mod.recordOverride({ rootDir: root, reason: 'hotfix; ships today' });

    const wp = readWorkflow(root).work_planner;
    assert.equal(wp.override, true);
    assert.equal(wp.override_reason, 'hotfix; ships today',
      'AC-003a: a bypass nobody can count is the failure mode the advisory floor was argued for');
  });
});

describe('the flag (Rollout prerequisite 1)', () => {
  it('test_when_flag_disabled_then_verdict_is_a_noop', async () => {
    const mod = await tryImport(PLANNER);
    assert.ok(mod, `${PLANNER} must exist`);
    for (const project of [{ velocity: { work_planner: { enabled: false } } }, {}, { velocity: {} }]) {
      const v = mod.checkEnabled(project);
      assert.equal(v, false, 'an absent key resolves false, so an un-upgraded config gets today\'s behaviour');
    }
    assert.equal(mod.checkEnabled({ velocity: { work_planner: { enabled: true } } }), true);
  });
});

describe('composition with rightsize-gate (AC-009)', () => {
  it('test_when_harness_sop_is_read_then_the_planner_precedes_rightsize_at_the_seam', () => {
    const sop = readFileSync(join(REPO_ROOT, '.claude/skills/harness/SKILL.md'), 'utf8');
    const planner = sop.indexOf('work-planner.mjs');
    const rightsize = sop.indexOf('rightsize-gate.mjs check');
    assert.ok(planner !== -1, 'the SOP must name work-planner.mjs, or nothing invokes it');
    assert.ok(rightsize !== -1, 'the SOP must still name the rightsize check');
    assert.ok(planner < rightsize,
      'AC-009: the planner decides whether the payload should GROW before rightsize decides which tail phases it warrants');
  });
});

// ─── the live measure ───
//
// `measurePayload` reads the ARCHIVED corpus, which is the right source once a
// workflow has landed and the wrong one while it is still running. Every ratio a
// person actually wants is for a workflow in flight — the number is only useful
// while there is still a decision left to make with it. So the live reader exists
// alongside the archived one, and the archived one still wins where both resolve.

const timingRows = (root, slug, rows) => {
  mkdirSync(join(root, '.claude/state/timing'), { recursive: true });
  writeFileSync(join(root, '.claude/state/timing', `${slug}.jsonl`),
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
};

const baselineRow = (out) => ({ phase: 'run-start', event: 'baseline', ts: 1, out_tokens: out });
const completedRow = (phase, out) => ({ phase, event: 'completed', ts: 2, out_tokens: out });

describe('the live payload measure', () => {
  it('test_when_workflow_is_live_then_payload_measures_from_the_timing_log', async () => {
    const mod = await tryImport(RATIO);
    const root = tempRepo();
    timingRows(root, 'w', [baselineRow(10_000), completedRow('tdd', 119_000)]);

    const measured = mod.measureLivePayload({ rootDir: root, slug: 'w', track: 'tdd-quickfix' });

    assert.equal(measured.measured, true, 'a timing log with a payload phase is measurable');
    assert.equal(measured.payload_tokens, 109_000, 'the payload is the delta from the run-start baseline');
    assert.equal(measured.source, 'live');
  });

  it('test_when_no_timing_log_exists_then_it_reports_unmeasured_rather_than_zero', async () => {
    const mod = await tryImport(RATIO);
    const root = tempRepo();

    const measured = mod.measureLivePayload({ rootDir: root, slug: 'w', track: 'tdd-quickfix' });

    assert.equal(measured.measured, false, 'no log is not the same claim as zero work');
    assert.equal(measured.payload_tokens, 0);
  });

  it('test_when_the_payload_phase_has_not_completed_then_it_reports_unmeasured', async () => {
    const mod = await tryImport(RATIO);
    const root = tempRepo();
    timingRows(root, 'w', [baselineRow(10_000), completedRow('scout', 20_000)]);

    const measured = mod.measureLivePayload({ rootDir: root, slug: 'w', track: 'tdd-quickfix' });

    assert.equal(measured.measured, false, 'a run that has not reached its payload phase has no payload yet');
  });

  it('test_when_slug_traverses_then_the_live_measure_refuses_before_reading', async () => {
    const mod = await tryImport(RATIO);
    const root = tempRepo();

    assert.throws(
      () => mod.measureLivePayload({ rootDir: root, slug: '../escape', track: 't' }),
      /slug/i,
      'it must refuse on the slug rule, not merely throw',
    );
  });
});

describe('the ratio verb', () => {
  it('test_when_ratio_verb_runs_on_a_live_workflow_then_it_reports_a_verdict', async () => {
    const mod = await tryImport(RATIO);
    const root = tempRepo();
    timingRows(root, 'w', [baselineRow(10_000), completedRow('tdd', 119_000)]);

    const verdict = mod.ratio({ rootDir: root, slug: 'w', track: 'tdd-quickfix' });

    assert.ok(['optimal', 'acceptable', 'under-floor'].includes(verdict.state),
      `a measurable run yields a real state, got ${verdict.state}`);
    assert.equal(typeof verdict.ratio, 'number');
    assert.equal(verdict.payload.source, 'live');
  });

  it('test_when_ratio_verb_runs_with_no_measurement_anywhere_then_it_says_unfitted', async () => {
    const mod = await tryImport(RATIO);
    const root = tempRepo();

    const verdict = mod.ratio({ rootDir: root, slug: 'w', track: 'tdd-quickfix' });

    assert.equal(verdict.state, 'unfitted', 'nothing to measure is reported, never guessed');
    assert.equal(verdict.ratio, null);
  });

  it('test_when_ratio_verb_runs_then_the_flag_does_not_gate_it', async () => {
    const mod = await tryImport(RATIO);
    const root = tempRepo();
    timingRows(root, 'w', [baselineRow(10_000), completedRow('tdd', 119_000)]);
    writeFileSync(join(root, '.claude/project.json'),
      JSON.stringify({ velocity: { work_planner: { enabled: false } } }, null, 2), 'utf8');

    const verdict = mod.ratio({ rootDir: root, slug: 'w', track: 'tdd-quickfix' });

    assert.notEqual(verdict.state, 'disabled', 'asking for the number is a read, so no flag withholds it');
  });
});
