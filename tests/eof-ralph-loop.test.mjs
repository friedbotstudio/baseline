import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Step 3 — the maker/checker RALPH loop. runRalph({checker, ctx, deps}) drives
// rounds up to the tier-dial ceiling; converges/stops/RED per D3; arbitration
// is mechanical grounding (D4) with the code-structure human-escalate exception (D6).

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const RALPH = pathToFileURL(join(ROOT, '.claude/skills/harness/ralph-loop.mjs')).href;

// A checker deps stub: a maker that never changes + a checker returning a fixed verdict.
function stubDeps({ checkerFindings, ceiling = 2, ledgerPath }) {
  let round = 0;
  return {
    resolveThreshold: () => ({ ceiling, floor: 0, mandatory: true }),
    runChecker: () => ({ findings: typeof checkerFindings === 'function' ? checkerFindings(round++) : checkerFindings }),
    runMaker: () => ({ changed: false }),
    ledgerPath,
  };
}

const grounded = { check: 'x', severity: 'BLOCKER', artifact: { kind: 'test' } };
const ungrounded = { check: 'x', severity: 'ADVISORY', artifact: null };

describe('ralph-loop — stop rule (AC-004)', () => {
  it('test_when_checker_below_floor_at_ceiling_then_RED_yields', async () => {
    const m = await import(RALPH);
    const out = await m.runRalph({ checker: 'security', ctx: {}, deps: stubDeps({ checkerFindings: [grounded], ceiling: 2 }) });
    assert.equal(out.state, 'RED', 'ceiling-hit-below-floor yields RED');
    assert.notEqual(out.state, 'PASS');
    assert.notEqual(out.state, 'CONVERGED');
  });

  it('test_when_checker_converges_then_converged', async () => {
    const m = await import(RALPH);
    const out = await m.runRalph({ checker: 'security', ctx: {}, deps: stubDeps({ checkerFindings: [], ceiling: 2 }) });
    assert.equal(out.state, 'CONVERGED');
  });

  it('test_when_dry_round_then_stopped', async () => {
    const m = await import(RALPH);
    // same finding every round, maker never changes -> dry -> STOPPED (not RED, not looping forever)
    const out = await m.runRalph({ checker: 'review', ctx: {}, deps: stubDeps({ checkerFindings: [ungrounded], ceiling: 5 }) });
    assert.ok(['STOPPED', 'CONVERGED'].includes(out.state), 'a dry round with only ungrounded findings stops, does not RED');
  });

  it('test_when_missing_deps_then_RED_fail_closed', async () => {
    const m = await import(RALPH);
    const out = await m.runRalph({ checker: 'security', ctx: {}, deps: null });
    assert.equal(out.state, 'RED', 'fail-closed to RED on broken deps');
  });
});

describe('ralph-loop — arbitration (AC-005)', () => {
  it('test_when_ungrounded_finding_then_advisory_cannot_block', async () => {
    const m = await import(RALPH);
    const out = await m.runRalph({ checker: 'security', ctx: {}, deps: stubDeps({ checkerFindings: [ungrounded], ceiling: 2 }) });
    assert.notEqual(out.state, 'RED', 'an ungrounded finding cannot drive RED (degrades to advisory)');
  });

  it('test_when_code_structure_ungrounded_then_escalates_human_not_advisory', async () => {
    const m = await import(RALPH);
    const out = await m.runRalph({ checker: 'code-structure', ctx: {}, deps: stubDeps({ checkerFindings: [ungrounded], ceiling: 2 }) });
    assert.ok(out.escalated === true || out.state === 'RED', 'code-structure ungrounded escalates to human, not silent advisory (D6)');
  });

  it('test_when_round_runs_then_evidence_ledger_appended', async () => {
    const m = await import(RALPH);
    const root = await mkdtemp(join(tmpdir(), 'eof-ralph-'));
    try {
      const ledgerPath = join(root, 'ledger.json');
      await mkdir(root, { recursive: true });
      await m.runRalph({ checker: 'security', ctx: {}, deps: stubDeps({ checkerFindings: [grounded], ceiling: 2, ledgerPath }) });
      const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
      assert.ok(Array.isArray(ledger.round_trips) && ledger.round_trips.length >= 1, 'each round appends to the evidence ledger');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
