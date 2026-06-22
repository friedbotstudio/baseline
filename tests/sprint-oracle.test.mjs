import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Module under test does not exist yet — import fails RED until /implement writes it.
import { runOracle } from '../.claude/skills/sprint-oracle/oracle.mjs';

// --- Foundation: real temp-dir fixtures (no mocks) ---
function mkFixture({ manifest, testFiles = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'sprint-oracle-'));
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2));
  const testRoot = join(dir, 'tests');
  mkdirSync(testRoot, { recursive: true });
  for (const [name, content] of Object.entries(testFiles)) {
    writeFileSync(join(testRoot, name), content);
  }
  return { dir, manifestPath, testRoot, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// A fixture test file carrying the @sprint-feature / @kind tag convention.
const TAGGED = [
  'import { test } from "node:test";',
  '// @sprint-feature:search @kind:edge',
  "test('search_empty_query', () => {});",
  '// @sprint-feature:search @kind:wiring',
  "test('search_end_to_end', () => {});",
  '// @sprint-feature:search @kind:happy',
  "test('search_basic', () => {});",
].join('\n');

function completeFeature(over = {}) {
  return {
    id: 'search',
    priority: 'P0',
    done_record: 'AC-012',
    edge_tests: ['search_empty_query'],
    wiring_test: 'search_end_to_end',
    ...over,
  };
}

test('test_when_all_features_complete_then_exit_0', () => {
  const fx = mkFixture({ manifest: { sprint: 's', features: [completeFeature()] }, testFiles: { 'a.test.mjs': TAGGED } });
  try {
    const r = runOracle({ manifestPath: fx.manifestPath, testRoot: fx.testRoot });
    assert.equal(r.code, 0);
    assert.equal(r.gaps.length, 0);
  } finally { fx.cleanup(); }
});

test('test_when_feature_missing_edge_test_then_exit_2_gap_edge', () => {
  const fx = mkFixture({ manifest: { sprint: 's', features: [completeFeature({ edge_tests: [] })] }, testFiles: { 'a.test.mjs': TAGGED } });
  try {
    const r = runOracle({ manifestPath: fx.manifestPath, testRoot: fx.testRoot });
    assert.equal(r.code, 2);
    assert.ok(r.gaps.some((g) => g.feature === 'search' && g.dimension === 'edge'), 'expected an edge gap for search');
  } finally { fx.cleanup(); }
});

test('test_when_feature_missing_wiring_then_exit_2_gap_wiring', () => {
  const fx = mkFixture({ manifest: { sprint: 's', features: [completeFeature({ wiring_test: '' })] }, testFiles: { 'a.test.mjs': TAGGED } });
  try {
    const r = runOracle({ manifestPath: fx.manifestPath, testRoot: fx.testRoot });
    assert.equal(r.code, 2);
    assert.ok(r.gaps.some((g) => g.feature === 'search' && g.dimension === 'wiring'), 'expected a wiring gap');
  } finally { fx.cleanup(); }
});

test('test_when_feature_missing_done_record_then_exit_2_gap_donerecord', () => {
  const fx = mkFixture({ manifest: { sprint: 's', features: [completeFeature({ done_record: '' })] }, testFiles: { 'a.test.mjs': TAGGED } });
  try {
    const r = runOracle({ manifestPath: fx.manifestPath, testRoot: fx.testRoot });
    assert.equal(r.code, 2);
    assert.ok(r.gaps.some((g) => g.feature === 'search' && g.dimension === 'done-record'), 'expected a done-record gap');
  } finally { fx.cleanup(); }
});

test('test_when_named_edge_test_absent_from_files_then_unresolved_gap', () => {
  const fx = mkFixture({ manifest: { sprint: 's', features: [completeFeature({ edge_tests: ['does_not_exist'] })] }, testFiles: { 'a.test.mjs': TAGGED } });
  try {
    const r = runOracle({ manifestPath: fx.manifestPath, testRoot: fx.testRoot });
    assert.equal(r.code, 2);
    const gap = r.gaps.find((g) => g.feature === 'search' && g.dimension === 'edge');
    assert.ok(gap, 'expected an edge gap');
    assert.match(String(gap.detail), /does_not_exist/, 'gap detail should name the unresolved test');
  } finally { fx.cleanup(); }
});

test('test_when_tag_kind_mismatch_happy_not_edge_then_unresolved', () => {
  // search_basic exists but is tagged @kind:happy — must NOT satisfy an edge requirement.
  const fx = mkFixture({ manifest: { sprint: 's', features: [completeFeature({ edge_tests: ['search_basic'] })] }, testFiles: { 'a.test.mjs': TAGGED } });
  try {
    const r = runOracle({ manifestPath: fx.manifestPath, testRoot: fx.testRoot });
    assert.equal(r.code, 2);
    assert.ok(r.gaps.some((g) => g.feature === 'search' && g.dimension === 'edge'), 'happy-tagged test must not count as edge');
  } finally { fx.cleanup(); }
});

test('test_when_manifest_empty_features_then_exit_0_vacuous', () => {
  const fx = mkFixture({ manifest: { sprint: 's', features: [] }, testFiles: {} });
  try {
    const r = runOracle({ manifestPath: fx.manifestPath, testRoot: fx.testRoot });
    assert.equal(r.code, 0);
    assert.equal(r.gaps.length, 0);
  } finally { fx.cleanup(); }
});

test('test_when_manifest_malformed_json_then_exit_1_loud', () => {
  const fx = mkFixture({ manifest: '{ this is not json', testFiles: {} });
  try {
    const r = runOracle({ manifestPath: fx.manifestPath, testRoot: fx.testRoot });
    assert.equal(r.code, 1, 'operational error is exit 1, distinct from gap exit 2');
    assert.ok(r.gaps.length === 0 || r.error, 'a loud operational error, not a gap list');
  } finally { fx.cleanup(); }
});
