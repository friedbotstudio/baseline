// checker-fanout live wiring — runCheckerFanout runner + velocity.checker_fanout flag.
// SUT: .claude/skills/harness/checker-fanout.mjs (runCheckerFanout/DEFAULT_CHECKER_REGISTRY
// not yet built -> RED). Governance scenario reads the real on-disk config files.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/harness/checker-fanout.mjs');
const DIAGRAM_ORACLE = path.join(ROOT, '.claude/skills/spec-diagram-review/oracle.mjs');
const TRACE_ORACLE = path.join(ROOT, '.claude/skills/spec-traceability-review/oracle.mjs');

const SPEC_PATH = 'docs/specs/checker-fanout-live-wiring.md';
const INTAKE_PATH = 'docs/intake/checker-fanout-live-wiring.md';

// --- fixtures -------------------------------------------------------------
const cyclicSpecTracingAc1 = [
  '# Spec', '## Design',
  '```plantuml', '@startuml', "' @kind dependency-graph",
  '[a] --> [b]', '[b] --> [a]', '@enduml', '```',
  '## Acceptance criteria',
  '| AC | Upstream |', '| AC-001 | intake AC 1 |',
].join('\n');

// Carries an explicit empty `## System delta` because this fixture is the one that
// must come back CLEAN through the DEFAULT registry, and that registry now includes
// the spec-lint adapter. `checkSystemDelta` treats an ABSENT heading as FAIL — the
// same judgement `artifact_template_guard` makes at the write boundary, which a
// synthetic fixture never passes through. `*(none)*` is the template's sanctioned
// "considered it, nothing changes" body, so this states the fixture's intent rather
// than exempting it from the check.
const acyclicSpecTracingBoth = [
  '# Spec', '## Design',
  '```plantuml', '@startuml', "' @kind dependency-graph",
  '[a] --> [b]', '@enduml', '```',
  '## System delta',
  '- *(none)*',
  '## Acceptance criteria',
  '| AC | Upstream |', '| AC-001 | intake AC 1 |', '| AC-002 | intake AC 2 |',
].join('\n');

const intakeTwoAcs = [
  '# Intake', '## Acceptance criteria',
  '1. First criterion.', '2. Second criterion.',
].join('\n');

// A readFile stub: spec path -> spec content; intake path -> intake content (or null).
function makeReader({ spec, intake }) {
  return (p) => {
    if (p.includes('/specs/')) return spec;
    if (p.includes('/intake/')) return intake;
    return null;
  };
}

// A registry built from the REAL oracles with the tier dial forced mandatory:true,
// so artifact-backed findings deterministically reach BLOCKER regardless of project tier.
async function mandatoryRegistry() {
  const { runDiagramOracle } = await import(DIAGRAM_ORACLE);
  const { runTraceabilityOracle } = await import(TRACE_ORACLE);
  const force = { tierDial: () => ({ mandatory: true }) };
  return {
    'spec-diagram': (ctx) => runDiagramOracle(ctx.specContent, force),
    'spec-traceability': (ctx) => (ctx.intakeContent == null
      ? { findings: [] }
      : runTraceabilityOracle({ spec: ctx.specContent, intake: ctx.intakeContent }, force)),
  };
}

describe('checker-fanout live wiring (runCheckerFanout + velocity flag)', () => {
  it('test_when_fanout_enabled_with_cycle_and_dropped_ac_then_merged_blocked', async () => {
    const { runCheckerFanout } = await import(SUT);
    const registry = await mandatoryRegistry();
    const args = {
      slug: 'checker-fanout-live-wiring',
      rootDir: ROOT,
      enabled: true,
      registry,
      readFile: makeReader({ spec: cyclicSpecTracingAc1, intake: intakeTwoAcs }),
    };
    const merged = await runCheckerFanout(args);
    assert.equal(merged.verdict, 'BLOCKED', 'a cycle + a dropped AC -> BLOCKED');
    const checkers = new Set(merged.findings.map((f) => f.checker));
    assert.ok(checkers.has('spec-diagram'), 'cycle finding from spec-diagram present');
    assert.ok(checkers.has('spec-traceability'), 'dropped-AC finding from spec-traceability present');

    const again = await runCheckerFanout(args);
    assert.equal(JSON.stringify(merged), JSON.stringify(again),
      'same inputs -> byte-identical merged result (deterministic / parallel==serial)');
  });

  it('test_when_fanout_disabled_then_skipped_fail_open', async () => {
    const { runCheckerFanout } = await import(SUT);
    const exploding = {
      'spec-diagram': () => { throw new Error('adapter must not run when disabled'); },
      'spec-traceability': () => { throw new Error('adapter must not run when disabled'); },
    };
    let result;
    await assert.doesNotReject(async () => {
      result = await runCheckerFanout({
        slug: 'checker-fanout-live-wiring',
        rootDir: ROOT,
        enabled: false,
        registry: exploding,
        readFile: makeReader({ spec: cyclicSpecTracingAc1, intake: intakeTwoAcs }),
      });
    }, 'disabled fan-out is a no-op skip, never throws');
    assert.ok(result && result.skipped === true, 'disabled -> {skipped:true} marker');
  });

  it('test_when_clean_spec_then_verdict_clean', async () => {
    const { runCheckerFanout } = await import(SUT);
    // No registry injected -> exercises DEFAULT_CHECKER_REGISTRY wiring.
    const merged = await runCheckerFanout({
      slug: 'checker-fanout-live-wiring',
      rootDir: ROOT,
      enabled: true,
      readFile: makeReader({ spec: acyclicSpecTracingBoth, intake: intakeTwoAcs }),
    });
    assert.equal(merged.verdict, 'CLEAN', 'acyclic + all ACs traced -> CLEAN');
    assert.deepEqual(merged.findings, [], 'no findings on a clean spec');
  });

  it('test_when_intake_missing_then_traceability_empty_no_throw', async () => {
    const { runCheckerFanout } = await import(SUT);
    // Default registry; intake reader returns null (spec-entry track has no intake).
    let merged;
    await assert.doesNotReject(async () => {
      merged = await runCheckerFanout({
        slug: 'checker-fanout-live-wiring',
        rootDir: ROOT,
        enabled: true,
        readFile: makeReader({ spec: cyclicSpecTracingAc1, intake: null }),
      });
    }, 'missing intake must not throw');
    const checkers = new Set(merged.findings.map((f) => f.checker));
    assert.ok(!checkers.has('spec-traceability'),
      'spec-traceability contributes zero findings when intake is absent');
  });

  it('test_when_checkers_list_subsets_registry_then_only_named_run', async () => {
    const { runCheckerFanout } = await import(SUT);
    const calls = [];
    const instrumented = {
      'spec-diagram': (ctx) => { calls.push('spec-diagram'); return { findings: [] }; },
      'spec-traceability': (ctx) => { calls.push('spec-traceability'); return { findings: [] }; },
    };
    await runCheckerFanout({
      slug: 'checker-fanout-live-wiring',
      rootDir: ROOT,
      enabled: true,
      checkers: ['spec-diagram'],
      registry: instrumented,
      readFile: makeReader({ spec: cyclicSpecTracingAc1, intake: intakeTwoAcs }),
    });
    assert.deepEqual(calls, ['spec-diagram'],
      'only the named checker runs; spec-traceability is never invoked');
  });

  it('test_when_velocity_flag_then_enabled_in_project_and_template', () => {
    const project = JSON.parse(readFileSync(path.join(ROOT, '.claude/project.json'), 'utf8'));
    const template = JSON.parse(readFileSync(path.join(ROOT, 'src/project.template.json'), 'utf8'));
    for (const [label, cfg] of [['project.json', project], ['src/project.template.json', template]]) {
      const flag = cfg.velocity && cfg.velocity.checker_fanout;
      assert.ok(flag, `${label} carries velocity.checker_fanout`);
      assert.equal(flag.enabled, true, `${label} checker_fanout default-enabled`);
      assert.ok(Array.isArray(flag.checkers)
        && flag.checkers.includes('spec-diagram')
        && flag.checkers.includes('spec-traceability'),
        `${label} checkers lists both graduated oracles`);
    }
  });
});
