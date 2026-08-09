// Ticket read-front-door-sweep — T-006 (AC-005, AC-011, AC-012, AC-014).
//
// Folds `sweep.mjs`'s private `main()` behind a `sweep` verb on
// `memory-sync/cli.mjs`, riding a new named export `runSweep({mode, rootDir})`
// that returns the report as DATA. The direct `node sweep.mjs` path must stay
// byte-identical (AC-005) — its own main-guard and private argv surface are
// unchanged; it now calls `runSweep` internally instead of re-implementing the
// mode dispatch.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { runCli, runCliJson, assertPresent } from './helpers/cli-runner.mjs';

const SWEEP_HELPER = '.claude/skills/memory-sync/sweep.mjs';
const CLI_PATH = join(REPO_ROOT, '.claude/skills/memory-sync/cli.mjs');

describe('memory-sync sweep verb — parity with the direct helper (AC-005)', () => {
  it('test_when_sweep_verb_and_direct_helper_run_on_same_fixture_then_payloads_match', () => {
    const { root, memDir } = makeProject();

    const direct = runCliJson(SWEEP_HELPER, ['--mode', 'backlog-decay', '--memory-dir', memDir]);
    assertPresent(assert, direct);
    assert.equal(direct.status, 0, `direct path must exit 0, got: ${direct.out}`);
    assert.ok(direct.json, `direct path stdout must be parseable JSON, got: ${direct.stdout}`);

    const viaVerb = runCliJson('memory-sync', ['sweep', '--mode', 'backlog-decay', '--json', '--root', root]);
    assertPresent(assert, viaVerb);
    assert.equal(viaVerb.status, 0, `verb path must exit 0, got: ${viaVerb.out}`);
    assert.ok(viaVerb.json, `verb path stdout must be parseable JSON, got: ${viaVerb.stdout}`);

    assert.deepEqual(
      viaVerb.json,
      direct.json,
      'the folded verb and the direct helper must report the identical payload for the identical fixture',
    );
  });

  it('test_when_sweep_mjs_invoked_directly_then_main_guard_still_fires', () => {
    const { memDir } = makeProject();

    const res = runCliJson(SWEEP_HELPER, ['--mode', 'auto-close', '--memory-dir', memDir]);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `direct invocation must still run to completion and exit 0, got: ${res.out}`);
    assert.ok(res.json, `direct invocation must still emit a parseable report, got: ${res.stdout}`);
    assert.ok('closed' in res.json, 'the auto-close report shape must be unchanged');
  });
});

describe('memory-sync sweep verb — --json is parseable and exclusive (AC-011)', () => {
  it('test_when_sweep_verb_runs_then_stdout_is_parseable_json_only', () => {
    const { root } = makeProject();

    const res = runCliJson('memory-sync', ['sweep', '--mode', 'backlog-decay', '--json', '--root', root]);
    assertPresent(assert, res);
    assert.equal(res.status, 0);
    assert.ok(res.json, `stdout must be parseable JSON, got: ${res.stdout}`);
    assert.equal(res.stderr, '', 'nothing but JSON should reach stdout/stderr on success');
    assert.equal(
      res.stdout,
      JSON.stringify(res.json, null, 2) + '\n',
      'stdout must contain the JSON payload and nothing else',
    );
  });
});

describe('sweep.mjs — runSweep named export (AC-014)', () => {
  it('test_when_run_sweep_imported_then_named_export_exists_and_returns_data', async () => {
    const mod = await tryImport(SWEEP_HELPER);
    assert.ok(mod && typeof mod.runSweep === 'function', `${SWEEP_HELPER} must export runSweep()`);

    const { root } = makeProject();
    const report = mod.runSweep({ mode: 'backlog-decay', rootDir: root });

    assert.notEqual(typeof report, 'number', 'runSweep must return the report object, not an exit code');
    assert.equal(typeof report, 'object', 'runSweep must return the report as data');
    assert.ok(report && 'surfaced' in report, 'the backlog-decay report shape must be intact');
  });
});

describe('memory-sync sweep verb — usage contract (AC-012)', () => {
  it('test_when_mode_flag_missing_value_then_usage_error_exit_one', () => {
    const res = runCli('memory-sync', ['sweep', '--mode']);
    assertPresent(assert, res);
    assert.equal(res.status, 1, `a missing --mode value must exit 1, got: ${res.out}`);
    assert.ok(
      res.stderr.includes('--mode requires a value'),
      `stderr must name the missing flag, got: ${res.stderr}`,
    );
  });

  it('test_when_mode_unknown_then_error_names_the_legal_modes', () => {
    const { root } = makeProject();

    const res = runCli('memory-sync', ['sweep', '--mode', 'bogus-mode', '--root', root]);
    assertPresent(assert, res);
    assert.notEqual(res.status, 0, `an unknown --mode must not exit 0, got: ${res.out}`);
    assert.ok(res.stderr.includes('stamp-closure'), `stderr must name stamp-closure, got: ${res.stderr}`);
    assert.ok(res.stderr.includes('backlog-decay'), `stderr must name backlog-decay, got: ${res.stderr}`);
  });
});

describe('memory-sync/cli.mjs sweep handler — delegates, does not reimplement (AC-014)', () => {
  it('test_when_verb_source_read_then_it_delegates_rather_than_reimplements', () => {
    const source = readFileSync(CLI_PATH, 'utf8');
    assert.ok(
      /from ['"]\.\/sweep\.mjs['"]/.test(source),
      'cli.mjs must import from ./sweep.mjs rather than duplicating its logic',
    );
    assert.ok(source.includes('runSweep'), 'cli.mjs must call the named export runSweep');
    assert.ok(
      !source.includes('MODE_DISPATCH') && !/['"]auto-close['"]\s*:/.test(source),
      'cli.mjs must not carry its own copy of the mode dispatch table',
    );
  });
});
