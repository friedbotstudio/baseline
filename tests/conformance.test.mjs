// The conformance check itself: it agrees with the shipped audit caller, it
// covers the divergences that were live at 02f3c68, and it cannot report clean
// while measuring nothing.
//
// NOT env-gated, deliberately. Eight tests in this suite are gated behind
// PUBLISH_TESTS / PLANTUML_TESTS, which is how `spec-lint-fixture-omits-system-
// delta-3f7a` stayed red and unread. A check nobody runs is the failure this
// check exists to catch.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runConformance,
  loadFixture,
  ConformanceUnmeasured,
  MIN_ROWS,
  MIN_READERS,
} from '../.claude/skills/conformance/engine.mjs';
import { registrations } from '../.claude/skills/conformance/registry.mjs';
import { run as auditCheck } from '../.claude/skills/audit-baseline/checks/conformance.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE_DIR = join(REPO_ROOT, '.claude', 'skills', 'conformance', 'fixtures');
const FIXTURE_FILES = ['spec.json', 'epic-state.json', 'memory-entry.json'];

function tmpFixture(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'conformance-'));
  for (const file of FIXTURE_FILES) {
    const data = JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8'));
    writeFileSync(join(dir, file), JSON.stringify(mutate(data, file), null, 2));
  }
  return dir;
}

describe('the live fixture', () => {
  // covers AC-010
  test('test_when_the_shipped_fixture_runs_then_every_reader_matches_its_reviewed_value', () => {
    const result = runConformance({ fixtureDir: FIXTURE_DIR });
    assert.deepEqual(result.failures, [], 'a failure names the reader that stopped agreeing');
    assert.deepEqual(result.unmeasured, []);
  });

  // covers AC-012
  test('test_when_the_fixture_runs_then_it_measures_more_than_the_floors', () => {
    const { measured } = runConformance({ fixtureDir: FIXTURE_DIR });
    assert.ok(measured.rowCount >= MIN_ROWS, `${measured.rowCount} rows`);
    assert.ok(measured.readerCount >= MIN_READERS, `${measured.readerCount} readers`);
    assert.ok(measured.assertionCount > 0);
  });

  // covers AC-010
  test('test_when_every_row_is_read_then_it_names_the_entry_it_was_harvested_from', () => {
    for (const row of loadFixture(FIXTURE_DIR)) {
      assert.ok(row.why && row.why.length > 20, `${row.id} must say where it came from`);
    }
  });

  // covers AC-010
  test('test_when_the_fixture_is_inspected_then_it_covers_all_three_artifacts', () => {
    const artifacts = new Set(loadFixture(FIXTURE_DIR).map((r) => r.artifact));
    assert.deepEqual([...artifacts].sort(), ['epic-state', 'memory-entry', 'spec']);
  });
});

describe('anti-vacuity — the check cannot report clean while measuring nothing', () => {
  // covers AC-012
  test('test_when_the_fixture_is_emptied_then_the_engine_refuses_to_report_clean', () => {
    const dir = tmpFixture((data) => ({ ...data, rows: [] }));
    assert.throws(
      () => runConformance({ fixtureDir: dir }),
      (err) => err instanceof ConformanceUnmeasured && /floor is/.test(err.message),
    );
  });

  // covers AC-012
  test('test_when_the_registry_is_below_the_reader_floor_then_the_engine_refuses', () => {
    assert.throws(
      () => runConformance({ fixtureDir: FIXTURE_DIR, registry: registrations().slice(0, 2) }),
      (err) => err instanceof ConformanceUnmeasured && /readers, floor is/.test(err.message),
    );
  });

  // covers AC-012
  test('test_when_a_reader_is_degenerate_on_every_row_then_it_is_reported_unmeasured', () => {
    const registry = [
      ...registrations(),
      { id: 'synthetic:always-empty', artifact: 'spec', section: 'nothing', module: 'synthetic', read: () => [] },
    ];
    const result = runConformance({ fixtureDir: FIXTURE_DIR, registry });
    assert.deepEqual(result.unmeasured, ['synthetic:always-empty']);
  });

  // covers AC-012
  test('test_when_a_registration_matches_no_artifact_then_it_is_reported_unmeasured', () => {
    const registry = [
      ...registrations(),
      { id: 'synthetic:no-artifact', artifact: 'nothing-shaped-like-this', section: 'x', module: 'synthetic', read: () => 'value' },
    ];
    assert.deepEqual(runConformance({ fixtureDir: FIXTURE_DIR, registry }).unmeasured, ['synthetic:no-artifact']);
  });

  // covers AC-012
  test('test_when_a_row_is_missing_a_field_then_loading_refuses', () => {
    const dir = tmpFixture((data, file) =>
      file === 'spec.json' ? { ...data, rows: data.rows.map(({ expect, ...rest }) => rest) } : data);
    assert.throws(() => loadFixture(dir), (err) => err instanceof ConformanceUnmeasured && /missing/.test(err.message));
  });

  // covers AC-012
  test('test_when_two_rows_share_an_id_then_loading_refuses', () => {
    const dir = tmpFixture((data, file) =>
      file === 'spec.json' ? { ...data, rows: [...data.rows, data.rows[0]] } : data);
    assert.throws(() => loadFixture(dir), (err) => err instanceof ConformanceUnmeasured && /duplicate/.test(err.message));
  });
});

describe('a drifted reader is caught', () => {
  // covers AC-011
  test('test_when_a_reader_narrows_then_the_check_fails_naming_it_and_the_row', () => {
    const narrowed = registrations().map((r) =>
      r.id === 'slice-grammar:acs' ? { ...r, read: () => ({}) } : r);
    const result = runConformance({ fixtureDir: FIXTURE_DIR, registry: narrowed });
    assert.ok(result.failures.length > 0);
    for (const f of result.failures) assert.equal(f.readerId, 'slice-grammar:acs');
    assert.ok(result.failures.some((f) => f.rowId === 'spec/titled-slice-heading'),
      'the titled-heading row is the one that shipped as 0.26.5');
  });

  // covers AC-010
  test('test_when_a_reader_throws_then_the_failure_carries_the_error_not_a_crash', () => {
    const broken = registrations().map((r) =>
      r.id === 'closure-check:stamp' ? { ...r, read: () => { throw new Error('boom'); } } : r);
    const result = runConformance({ fixtureDir: FIXTURE_DIR, registry: broken });
    const failure = result.failures.find((f) => f.readerId === 'closure-check:stamp');
    assert.ok(failure, 'a throwing reader is a failure, not an exception out of the engine');
    assert.match(JSON.stringify(failure.actual), /boom/);
  });
});

describe('two callers, one engine', () => {
  // covers AC-017
  test('test_when_both_callers_run_then_they_agree_on_the_verdict', () => {
    const engineResult = runConformance({ fixtureDir: FIXTURE_DIR });
    const auditRows = auditCheck({ root: REPO_ROOT });
    const auditFails = auditRows.filter(([, status]) => status === 'FAIL');
    assert.equal(
      auditFails.length === 0,
      engineResult.failures.length === 0 && engineResult.unmeasured.length === 0,
      'the shipped caller and the CI caller must not disagree about the same fixture',
    );
  });

  // covers AC-017
  test('test_when_the_callers_are_read_then_neither_carries_a_fixture_or_a_comparison', () => {
    const auditSource = readFileSync(
      join(REPO_ROOT, '.claude', 'skills', 'audit-baseline', 'checks', 'conformance.mjs'), 'utf8');
    const testSource = readFileSync(join(REPO_ROOT, 'tests', 'conformance.test.mjs'), 'utf8');
    for (const [name, src] of [['audit check', auditSource], ['this test', testSource]]) {
      assert.ok(src.includes('conformance/engine.mjs'), `${name} must call the shared engine`);
      // Carrying a fixture means holding artifact CONTENT — a spec section, an
      // entry's frontmatter stamp. Reading the shared fixture and mutating a
      // copy is the opposite: it proves the callers share one source.
      //
      // The sentinels are assembled at runtime. Written as literals they would
      // appear in this file and the assertion would flag itself, which is a
      // check that measures its own text rather than the code.
      for (const sentinel of [`##${' '}Acceptance criteria`, `superseded-at${':'}`, `##${' '}Slice `]) {
        assert.ok(!src.includes(sentinel), `${name} must not inline artifact content`);
      }
      // The engine owns the comparison. A caller that compares expected to
      // actual itself can drift from the other caller's verdict.
      assert.ok(!/f\.expected\s*===|deepEqual\(\s*f\.actual/.test(src),
        `${name} must not compare expected to actual itself`);
    }
  });

  // covers AC-013
  test('test_when_the_audit_is_read_then_it_registers_the_conformance_check', () => {
    const auditSource = readFileSync(
      join(REPO_ROOT, '.claude', 'skills', 'audit-baseline', 'audit.mjs'), 'utf8');
    assert.match(auditSource, /from '\.\/checks\/conformance\.mjs'/);
    assert.match(auditSource, /\bconformance\b,/, 'imported but unregistered is a check nobody runs');
  });

  // covers AC-015
  test('test_when_this_suite_is_read_then_it_carries_no_env_gate', () => {
    const src = readFileSync(join(REPO_ROOT, 'tests', 'conformance.test.mjs'), 'utf8');
    assert.ok(!/process\.env\.(PUBLISH_TESTS|PLANTUML_TESTS)/.test(src),
      'gating this suite reproduces spec-lint-fixture-omits-system-delta-3f7a');
  });
});

describe('the shipped engine reaches nothing dev-only', () => {
  // covers AC-016
  test('test_when_shipped_modules_are_read_then_none_reaches_a_dev_tree_path', () => {
    const shipped = [
      ['.claude', 'skills', 'conformance', 'engine.mjs'],
      ['.claude', 'skills', 'conformance', 'registry.mjs'],
      ['.claude', 'skills', 'conformance', 'cli.mjs'],
      ['.claude', 'skills', 'audit-baseline', 'checks', 'conformance.mjs'],
      ['.claude', 'skills', 'lib', 'slice-grammar.mjs'],
      ['.claude', 'skills', 'lib', 'epic-acs.mjs'],
    ];
    for (const parts of shipped) {
      const src = readFileSync(join(REPO_ROOT, ...parts), 'utf8');
      for (const devPrefix of ["'tests/", "'src/", "'scripts/", "'obj/", "../../tests/", "../../src/"]) {
        assert.ok(!src.includes(devPrefix),
          `${parts.join('/')} reaches ${devPrefix} — a consumer install does not have it`);
      }
    }
  });
});
