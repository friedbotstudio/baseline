// release-safety-2026-08-25 T6 — AC-011, AC-012, AC-013.
//
// checker-fanout attaches `inputState` only for the code-review phase, so a
// spec-review CLEAN produced by a checker that could not run reads identically to
// one where every checker executed and found nothing.
//
// It is not hypothetical. `spec-shippability-review` carries no `owner: baseline`,
// build-template.sh prunes it from every consumer install, and the adapter loads
// its analyzer dynamically and returns an empty findings list on the catch. That
// fail-open is correct and deliberate (security review 2026-08-09, F-3) — a
// top-level import would break the whole fan-out at module load. What is missing
// is the annotation saying the checker never ran.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { tryImport } from './helpers/memory-fixtures.mjs';

const FANOUT = '.claude/skills/harness/checker-fanout.mjs';
const SHIPPABILITY_ADAPTER = '.claude/skills/harness/checkers/spec-shippability.mjs';

async function fanout() {
  const mod = await tryImport(FANOUT);
  assert.ok(mod, `${FANOUT} must be importable`);
  return mod;
}

function ranAdapter(findings = []) {
  return { phase: 'spec-review', run: async () => ({ findings }) };
}

function inertAdapter() {
  return { phase: 'spec-review', run: async () => ({ findings: [], ran: false }) };
}

describe('T6 — a checker that could not run says so (AC-011)', () => {
  it('test_when_an_adapter_reports_ran_false_then_the_verdict_names_it_in_notRun', async () => {
    const mod = await fanout();
    assert.equal(typeof mod.mergeVerdicts, 'function', 'expected named export `mergeVerdicts`');

    const merged = mod.mergeVerdicts([
      { checker: 'spec-diagram', findings: [], ran: true },
      { checker: 'spec-shippability', findings: [], ran: false },
    ]);

    assert.deepEqual(
      merged.notRun,
      ['spec-shippability'],
      'a CLEAN verdict must name the checkers that contributed nothing because they could not run',
    );
    assert.equal(merged.verdict, 'CLEAN', 'the verdict itself is unchanged — it is clean as far as anything could see');
  });

  it('test_when_the_fanout_runs_an_inert_adapter_then_notRun_reaches_the_merged_verdict', async () => {
    const mod = await fanout();
    const root = mkdtempSync(join(tmpdir(), 'fanout-notrun-'));
    mkdirSync(join(root, 'docs', 'specs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'specs', 'probe.md'), '# probe\n', 'utf8');

    const merged = await mod.runCheckerFanout({
      slug: 'probe',
      rootDir: root,
      enabled: true,
      phase: 'spec-review',
      checkers: ['inert', 'live'],
      registry: { inert: inertAdapter(), live: ranAdapter() },
    });

    assert.deepEqual(merged.notRun, ['inert'], 'runOne must carry `ran` through to mergeVerdicts');
  });
});

describe('T6 — an adapter that says nothing is treated as having run (AC-012)', () => {
  it('test_when_no_adapter_declares_ran_then_notRun_is_empty_and_the_verdict_is_unchanged', async () => {
    const mod = await fanout();
    const merged = mod.mergeVerdicts([
      { checker: 'spec-diagram', findings: [] },
      { checker: 'spec-traceability', findings: [] },
    ]);

    assert.deepEqual(merged.notRun, [], 'absence of `ran` reads as true, so the five existing adapters are untouched');
    assert.equal(merged.verdict, 'CLEAN');
    assert.deepEqual(merged.checkers, ['spec-diagram', 'spec-traceability']);
  });

  it('test_when_an_inert_adapter_reports_a_blocker_then_the_verdict_still_blocks', async () => {
    const mod = await fanout();
    const merged = mod.mergeVerdicts([
      { checker: 'partial', findings: [{ severity: 'BLOCKER', check: 'x' }], ran: false },
    ]);

    assert.equal(merged.verdict, 'BLOCKED', 'notRun annotates the verdict; it must never soften one');
    assert.deepEqual(merged.notRun, ['partial']);
  });

  it('test_when_pre_implementation_gate_reads_a_verdict_with_notRun_then_its_decision_is_unchanged', async () => {
    const gate = await tryImport('.claude/skills/harness/pre-implementation-gate.mjs');
    assert.ok(gate, 'pre-implementation-gate.mjs must be importable');

    const root = mkdtempSync(join(tmpdir(), 'fanout-gate-'));
    mkdirSync(join(root, '.claude', 'state', 'checker-fanout'), { recursive: true });
    writeFileSync(
      join(root, '.claude', 'state', 'checker-fanout', 'probe.json'),
      JSON.stringify({ verdict: 'CLEAN', findings: [], checkers: ['a'], notRun: ['a'] }),
      'utf8',
    );

    const decision = gate.checkImplementationReady({ slug: 'probe', rootDir: root });
    assert.equal(
      decision.ready,
      true,
      'the gate reads `verdict`, not `notRun` — the new field must not change gate behaviour',
    );
  });
});

describe('T6 — the pruned analyzer reports itself (AC-013)', () => {
  it('test_when_the_shippability_analyzer_cannot_import_then_the_adapter_reports_ran_false', async () => {
    const mod = await tryImport(SHIPPABILITY_ADAPTER);
    assert.ok(mod?.specShippabilityAdapter, 'expected named export `specShippabilityAdapter`');

    // The pruned state cannot be produced by changing rootDir: loadAnalyzer imports
    // '../../spec-shippability-review/analyzer.mjs' relative to its OWN module, so
    // in the dev tree it always resolves. The catch is reachable only through an
    // injected loader — the same seam runCheckerFanout already exposes for
    // `registry` and `readFile`.
    const root = mkdtempSync(join(tmpdir(), 'fanout-pruned-'));
    mkdirSync(join(root, 'obj', 'template', '.claude'), { recursive: true });
    writeFileSync(
      join(root, 'obj', 'template', '.claude', 'manifest.json'),
      JSON.stringify({ files: {} }),
      'utf8',
    );

    let result;
    await assert.doesNotReject(async () => {
      result = await mod.specShippabilityAdapter.run({
        slug: 'probe',
        rootDir: root,
        specContent: '# probe\n\n```bash\nnode ./src/thing.js\n```\n',
        loadAnalyzer: async () => null,
      });
    }, 'the fail-open path must stay a catch, never a throw — F-3');

    assert.deepEqual(result.findings, [], 'the fail-open result is still an empty findings list');
    assert.equal(
      result.ran,
      false,
      'the adapter must report that it could not run, so the verdict can say so instead of reading as a real CLEAN',
    );
  });

  it('test_when_the_analyzer_loads_then_the_adapter_does_not_claim_it_was_inert', async () => {
    const mod = await tryImport(SHIPPABILITY_ADAPTER);
    const root = mkdtempSync(join(tmpdir(), 'fanout-live-'));
    mkdirSync(join(root, 'obj', 'template', '.claude'), { recursive: true });
    writeFileSync(
      join(root, 'obj', 'template', '.claude', 'manifest.json'),
      JSON.stringify({ files: { '.claude/skills/probe/helper.mjs': 'abc' } }),
      'utf8',
    );

    const result = await mod.specShippabilityAdapter.run({
      slug: 'probe',
      rootDir: root,
      specContent: '# probe\n\nno code fences here\n',
    });

    assert.notEqual(result.ran, false, 'a checker that actually ran must not be reported in notRun');
  });
});
