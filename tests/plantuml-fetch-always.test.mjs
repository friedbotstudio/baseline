// fetchPlantumlIfMissing — always-download contract after detectSystemPlantuml
// removal. Replaces the pre-change "skips when system plantuml on PATH" test
// at tests/plantuml.test.mjs:25-32.
//
// Three assertions:
//   1. The detectSystemPlantuml export is gone (D5 removal contract).
//   2. FETCH_OUTCOMES no longer carries SKIPPED_SYSTEM_PLANTUML.
//   3. Passing a legacy `systemPlantumlPath` opt does NOT short-circuit the
//      fetch — the function ignores the field and proceeds to write the jar.
//
// Tests are RED until /implement removes detectSystemPlantuml + the
// SKIPPED_SYSTEM_PLANTUML enum + the systemPlantumlPath opt handling.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const plantuml = await import('../src/cli/plantuml.js');

async function realJarBytes() {
  return readFile('.claude/bin/plantuml.jar');
}

function fakeFetchOk(buffer) {
  return async () => buffer;
}

describe('plantuml.js — detectSystemPlantuml removed (D5)', () => {
  it('test_when_plantuml_module_loaded_then_detectSystemPlantuml_export_is_absent', () => {
    assert.equal(
      typeof plantuml.detectSystemPlantuml,
      'undefined',
      'plantuml.detectSystemPlantuml must be removed after the always-download rewire',
    );
  });

  it('test_when_plantuml_module_loaded_then_FETCH_OUTCOMES_omits_SKIPPED_SYSTEM_PLANTUML', () => {
    const keys = Object.keys(plantuml.FETCH_OUTCOMES);
    assert.equal(
      keys.includes('SKIPPED_SYSTEM_PLANTUML'),
      false,
      `FETCH_OUTCOMES must not carry SKIPPED_SYSTEM_PLANTUML; got keys=${keys.join(',')}`,
    );
  });
});

describe('plantuml.js — fetchPlantumlIfMissing always-download (D5 + D1)', () => {
  it('test_when_fetchPlantumlIfMissing_receives_systemPlantumlPath_opt_then_it_is_ignored_and_fetch_proceeds', async () => {
    const target = await mkdtemp(join(tmpdir(), 'pu-target-'));
    await mkdir(join(target, '.claude/bin'), { recursive: true });
    const result = await plantuml.fetchPlantumlIfMissing(target, {
      systemPlantumlPath: '/usr/local/bin/plantuml',
      fetch: fakeFetchOk(await realJarBytes()),
    });
    assert.equal(
      result.outcome,
      'WROTE',
      `legacy systemPlantumlPath opt must NOT short-circuit; expected WROTE, got ${result.outcome}`,
    );
    const jarStat = await stat(join(target, '.claude/bin/plantuml.jar'));
    assert.ok(jarStat.isFile(), 'jar must exist on disk after the always-download fetch');
  });
});
