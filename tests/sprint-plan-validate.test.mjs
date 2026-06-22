import { test } from 'node:test';
import assert from 'node:assert/strict';

// Module under test does not exist yet — import fails RED until /implement writes it.
import { validateManifest } from '../.claude/skills/sprint-plan/validate-manifest.mjs';

function wellFormed(over = {}) {
  return {
    sprint: 'mvp',
    features: [
      { id: 'search', priority: 'P0', done_record: 'AC-012', edge_tests: ['search_empty_query'], wiring_test: 'search_end_to_end' },
      { id: 'auth', priority: 'P1', done_record: 'AC-020', edge_tests: ['auth_locked_out'], wiring_test: 'auth_login_flow' },
    ],
    ...over,
  };
}

test('test_when_manifest_has_required_fields_then_valid', () => {
  const r = validateManifest(wellFormed());
  assert.equal(r.valid, true);
  assert.equal(r.errors.length, 0);
});

test('test_when_feature_missing_done_criteria_field_then_invalid', () => {
  const m = wellFormed();
  delete m.features[0].wiring_test;
  const r = validateManifest(m);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.feature === 'search' && e.field === 'wiring_test'), 'should name the missing field');
});

test('test_when_feature_missing_priority_then_invalid', () => {
  const m = wellFormed();
  delete m.features[1].priority;
  const r = validateManifest(m);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.feature === 'auth' && e.field === 'priority'));
});

test('test_when_duplicate_feature_ids_then_invalid', () => {
  const m = wellFormed();
  m.features[1].id = 'search';
  const r = validateManifest(m);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /duplicate/i.test(e.reason)), 'should flag the duplicate id');
});
