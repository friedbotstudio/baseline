// mutation-testing-oracle (-f029) — unit + ship-guard + (env-gated) live tests.
// The oracle wraps Stryker's command runner over a bare `node --test` suite.
// Interface (codesign D2 + scenario-tick finding): `test:mutation -- <module> <testPath>`
// — test path is EXPLICIT (the co-named convention is not strict in this repo).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// The module under test does not exist yet (RED until implement-tick).
const wrapper = await import('../scripts/mutation-oracle.mjs');

describe('mutation-oracle — config scoping (AC-003, AC-004)', () => {
  it('test_when_module_arg_then_config_scopes_mutate_and_command', () => {
    const cfg = wrapper.buildConfig(
      '.claude/skills/memory-flush/route.mjs',
      'tests/memory-flush-routing.test.mjs',
    );
    assert.deepEqual(cfg.mutate, ['.claude/skills/memory-flush/route.mjs'], 'mutate scoped to one file');
    assert.equal(cfg.testRunner, 'command', 'uses the command runner (no framework)');
    assert.equal(
      cfg.commandRunner.command,
      'node --test tests/memory-flush-routing.test.mjs',
      'command runs ONLY the named test (AC-003), drives node --test (AC-004)',
    );
    assert.equal(cfg.coverageAnalysis, 'off', 'perTest is unsupported by the command runner (context7) → off');
  });
});

describe('mutation-oracle — survivor parsing (AC-001)', () => {
  it('test_when_stryker_json_parsed_then_survivors_as_file_line_kind', () => {
    const report = JSON.parse(
      readFileSync(join(HERE, 'fixtures/mutation-oracle/sample-stryker-report.json'), 'utf8'),
    );
    const survivors = wrapper.parseSurvivors(report);
    // Only the 'Survived' mutant should surface; Killed/NoCoverage/Timeout excluded.
    assert.equal(survivors.length, 1, 'exactly one survivor');
    assert.deepEqual(survivors[0], {
      file: '.claude/skills/memory-flush/route.mjs',
      line: 40,
      mutationKind: 'ConditionalExpression',
    });
  });
});

describe('mutation-oracle — advisory emit never touches the gate (AC-005)', () => {
  it('test_when_advisory_emitted_then_last_test_result_untouched', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'mut-oracle-'));
    const run = {
      scopeModule: 'x/y.mjs',
      mutantsTotal: 3,
      survivors: [{ file: 'x/y.mjs', line: 1, mutationKind: 'EqualityOperator' }],
    };
    const out = wrapper.emitAdvisory(run, { stateDir, generatedAt: '2026-06-05T00:00:00Z' });
    assert.ok(existsSync(out), 'advisory report written');
    const written = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(written.scopeModule, 'x/y.mjs');
    assert.equal(written.survivors.length, 1);
    // The binding verdict file must NOT be created by the oracle.
    assert.ok(!existsSync(join(stateDir, 'last_test_result')), 'oracle never writes last_test_result');
  });
});

describe('mutation-oracle — dev-only ship guard (AC-007)', () => {
  it('test_when_files_whitelist_and_buildout_then_no_stryker_or_wrapper_shipped', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    // scripts/ is not in the npm files whitelist → the wrapper never ships.
    assert.ok(
      !(pkg.files || []).some((f) => f.replace(/\/$/, '') === 'scripts'),
      'package.json files[] must not include scripts/',
    );
    // Stryker is a devDependency, never a runtime dependency.
    assert.ok(
      !(pkg.dependencies && pkg.dependencies['@stryker-mutator/core']),
      '@stryker-mutator/core must not be a runtime dependency',
    );
    // If a build output exists, it must be free of any stryker / wrapper reference.
    const tmpl = join(ROOT, 'obj/template');
    if (existsSync(tmpl)) {
      const offenders = [];
      const walk = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.(mjs|js|json|md)$/.test(e.name)) {
            const t = readFileSync(p, 'utf8');
            if (/stryker|mutation-oracle\.mjs/i.test(t)) offenders.push(p.slice(ROOT.length + 1));
          }
        }
      };
      walk(tmpl);
      assert.deepEqual(offenders, [], `shipped build output references stryker/wrapper: ${offenders.join(', ')}`);
    }
  });
});

// AC-002 — end-to-end proof that a vacuous test leaves a surviving mutant.
// Env-gated (MUTATION_TESTS=1) because it spawns real Stryker (seconds, needs the dev-dep),
// mirroring the repo's PUBLISH_TESTS / PLANTUML_TESTS pattern so default `npm test` stays fast.
describe('mutation-oracle — vacuous test leaves a survivor (AC-002, live)', () => {
  it('test_when_vacuous_test_over_fixture_then_survivor_reported', { skip: process.env.MUTATION_TESTS !== '1' }, async () => {
    const result = await wrapper.runOracle(
      'tests/fixtures/mutation-oracle/target.mjs',
      'tests/fixtures/mutation-oracle/target.vacuous.test.mjs',
      { cwd: ROOT },
    );
    assert.ok(result.survivors.length >= 1, 'the vacuous test should leave >= 1 surviving mutant');
  });
});
