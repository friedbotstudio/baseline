// checker-fanout — AC-007 (parallel == serial byte-identical) + AC-009 (LLM-agent fan-out rejected pre-rewrite)
// SUT: .claude/skills/harness/checker-fanout.mjs (not yet built -> RED).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/harness/checker-fanout.mjs');
const PLAN_STORE = path.join(ROOT, '.claude/skills/harness/plan-store.mjs');

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

// Slug guard + mirror isolation — docs/archive/2026-06-22/durable-plan-schema/security.md.
// checker-fanout builds `.claude/state/checker-fanout/<slug>.json` from the raw slug
// independently of plan-store (a SECOND construction site for the same CWE-22), and it
// mirrors the verdict into the durable plan outside any try/catch — so a plan-write
// failure could take down the live verdict that spec_approval_guard reads at gate A.
//
// Both reach the SUT through runCheckerFanout, its public seam. `registry` and `readFile`
// are parameters of that public API, so injecting them is dependency injection, not
// mocking an internal module (Art. VI.3 forbids the latter, and plan-store is never
// stubbed below — the mirror is made to fail with a REAL filesystem error).
const PLAN_DIR = ['.claude', 'state', 'plan'];
const FANOUT_DIR = ['.claude', 'state', 'checker-fanout'];

// An empty registry means zero adapters run, so the fan-out reduces to exactly the two
// behaviours under test: path construction from the slug, and the durable-plan mirror.
function fanoutArgs(slug, rootDir) {
  return {
    slug,
    rootDir,
    enabled: true,
    checkers: [],
    registry: {},
    readFile: () => '# spec\n',
  };
}

describe('checker-fanout — slug guard + durable-plan mirror isolation', () => {
  it('test_when_slug_is_hostile_then_persist_verdict_throws_before_writing_projection', async () => {
    const { runCheckerFanout } = await import(SUT);
    const dir = mkdtempSync(path.join(tmpdir(), 'fanout-guard-'));
    try {
      await assert.rejects(
        () => runCheckerFanout(fanoutArgs('../../evil', dir)),
        /slug/i,
        'a hostile slug must be rejected before any checker-fanout path is constructed',
      );

      assert.ok(
        !existsSync(path.join(dir, 'evil.json')),
        'traversal must not write the verdict projection outside .claude/state/checker-fanout/',
      );
      assert.ok(
        !existsSync(path.join(dir, ...FANOUT_DIR, 'evil.json')),
        'the slug must be REJECTED, not normalized into a safe-looking path',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('test_when_durable_plan_mirror_fails_then_live_verdict_projection_still_persists', {
    // root ignores the mode bits that make this test's EACCES happen at all.
    skip: process.getuid?.() === 0 ? 'runs as root; chmod-based EACCES cannot be induced' : false,
  }, async () => {
    const { runCheckerFanout } = await import(SUT);
    const { createPlan } = await import(PLAN_STORE);
    const dir = mkdtempSync(path.join(tmpdir(), 'fanout-mirror-'));
    const planFile = path.join(dir, ...PLAN_DIR, 'mirror-fail.json');
    try {
      // A VALID plan on disk, so the mirror actually engages (readPlan returns it and
      // setVerdictArtifact attempts a write) rather than no-opping on a missing plan.
      await createPlan({
        slug: 'mirror-fail',
        goal: 'mirror failure must not break the live verdict path',
        tasklist: [],
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      // Real EACCES, not a stub: make the plan FILE read-only so persistPlan's
      // writeFileSync genuinely fails inside the mirror. It must be the file, not the
      // directory — directory write permission governs creating and deleting entries,
      // while truncating an EXISTING file needs write permission on the file itself.
      chmodSync(planFile, 0o444);

      const merged = await runCheckerFanout(fanoutArgs('mirror-fail', dir));

      assert.equal(merged.verdict, 'CLEAN', 'the fan-out must still return its merged verdict');
      assert.ok(
        existsSync(path.join(dir, ...FANOUT_DIR, 'mirror-fail.json')),
        'the canonical projection spec_approval_guard reads at gate A must survive a '
        + 'durable-plan mirror failure — the mirror is best-effort, the projection is not',
      );
    } finally {
      chmodSync(planFile, 0o644); // restore so rmSync can clean up
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// AC-007 — the fan-out receives real input, and says which zero it means.
//
// `checker-fanout.mjs:64-65` reads `ctx.changedFiles || []`, and no helper
// anywhere builds `changedFiles` — `integrate/SKILL.md` step 3.5 delegates ctx
// assembly to main context prose. Every archived
// `.claude/state/checker-fanout-code/*.json` reads
// `{"findings": [], "verdict": "CLEAN"}`: measured, not assumed. The
// code-structure and backlog-deferral checkers have never run against real
// input, and the verdict they produced was indistinguishable from one that had.
//
// A quality gate whose input is assembled by prose instructions will eventually
// run with no input. Inputs that decide a verdict belong in a helper.
describe('checker-fanout — real input, and an honest zero (AC-007)', () => {
  const ASSEMBLER = path.join(ROOT, '.claude/skills/harness/assemble-context.mjs');

  async function loadAssembler() {
    const mod = await import(`${ASSEMBLER}?t=${Date.now()}-${Math.random()}`);
    if (typeof mod.assembleChangedFiles !== 'function') {
      throw new Error('assemble-context.mjs must export assembleChangedFiles');
    }
    return mod;
  }

  it('test_when_changed_files_assembled_then_fanout_receives_real_paths', async () => {
    const { assembleChangedFiles } = await loadAssembler();

    const files = assembleChangedFiles({
      rootDir: ROOT,
      exec: () => 'a.mjs\nb.mjs\n',
    });

    assert.deepEqual(files, ['a.mjs', 'b.mjs'],
      'the assembler must turn the working tree into the list the checkers read; ' +
      'today no producer exists at all and every checker sees []');
  });

  it('test_when_git_fails_then_assembler_returns_empty_and_marks_no_input', async () => {
    const { assembleChangedFiles, describeInputState } = await loadAssembler();

    const files = assembleChangedFiles({
      rootDir: ROOT,
      exec: () => { throw new Error('git exploded'); },
    });

    assert.deepEqual(files, [], 'a failed probe yields no paths');
    assert.equal(describeInputState(files, { probeFailed: true }), 'no-input',
      'a probe that could not run must never render as a clean review');
  });

  it('test_when_input_is_empty_then_verdict_carries_no_input_state', async () => {
    const { describeInputState } = await loadAssembler();

    assert.equal(describeInputState([], { probeFailed: false }), 'no-input',
      'zero files in means the checkers examined nothing — that is not a finding of ' +
      'zero problems, and the verdict must not spell them the same way');
  });

  it('test_when_files_changed_and_no_findings_then_verdict_says_measured', async () => {
    const { describeInputState } = await loadAssembler();

    assert.equal(describeInputState(['a.mjs'], { probeFailed: false }), 'measured',
      'a real run over real files that finds nothing is a genuine clean result; without ' +
      'this row, no-input and measured-zero could share a spelling and the suite would ' +
      'still pass');
  });
});
