// Workflow-extension-via-workflows-json — invariant violations
//
// One test per fixture under tests/fixtures/workflows-jsonl/. Each fixture
// triggers exactly one Article IV invariant or schema-violation path. The
// validator does not exist yet (RED until /implement lands).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');
const FIXTURES = path.join(HERE, 'fixtures/workflows-jsonl');

let validator;
try {
  validator = await import(path.join(REPO_ROOT, 'src/cli/workflows-validator.js'));
} catch (err) {
  throw new Error(
    `src/cli/workflows-validator.js not yet implemented (RED is expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}

// Foundation: load fixture, run validator, return result + first-error kind.
async function expectInvariantViolation(fixtureName) {
  const result = await validator.validateWorkflowsJsonl(
    path.join(FIXTURES, fixtureName)
  );
  assert.equal(result.ok, false, `${fixtureName}: expected validation failure`);
  assert.ok(Array.isArray(result.errors) && result.errors.length >= 1, `${fixtureName}: expected at least one error`);
  return result.errors[0];
}

describe('workflows-validator — invariant + schema violations', () => {
  it('test_when_workflows_jsonl_line_malformed_json_then_validator_returns_named_error_with_line_number', async () => {
    const err = await expectInvariantViolation('malformed-line.jsonl');
    assert.equal(err.kind, 'parse_failure', `expected kind=parse_failure, got ${err.kind}`);
    assert.ok(typeof err.line === 'number' && err.line >= 1, 'parse-failure error must include the offending line number');
  });

  it('test_when_track_invariant_i1_duplicate_track_ids_then_validator_returns_named_error', async () => {
    const err = await expectInvariantViolation('i1-duplicate-track-id.jsonl');
    assert.equal(err.kind, 'invariant_i1');
    assert.equal(err.track_id, 'duplicate-me');
  });

  it('test_when_track_invariant_i3_node_has_both_skill_and_subtrack_then_validator_returns_named_error', async () => {
    const err = await expectInvariantViolation('i3-skill-and-subtrack.jsonl');
    assert.equal(err.kind, 'invariant_i3');
    assert.match(err.message, /skill.*sub_track|sub_track.*skill/i, 'error message names both fields');
  });

  it('test_when_track_invariant_i3_selector_node_has_empty_alternates_then_validator_returns_named_error', async () => {
    const err = await expectInvariantViolation('i3-selector-empty-alternates.jsonl');
    assert.equal(err.kind, 'invariant_i3');
    assert.match(err.message, /selector.*alternates|alternates.*selector|empty.*alternates/i);
  });

  it('test_when_track_invariant_i4_depends_on_unknown_node_then_validator_returns_named_error', async () => {
    const err = await expectInvariantViolation('i4-bad-depends-on.jsonl');
    assert.equal(err.kind, 'invariant_i4');
    assert.match(err.message, /ghost-predecessor/);
  });

  it('test_when_track_invariant_i5_dag_has_cycle_then_validator_returns_named_error', async () => {
    const err = await expectInvariantViolation('i5-cycle.jsonl');
    assert.equal(err.kind, 'invariant_i5');
    assert.ok(Array.isArray(err.cycle) && err.cycle.length >= 2, 'cycle field names the cycle path');
  });

  it('test_when_track_invariant_i6_commits_track_missing_grant_commit_then_validator_returns_named_error', async () => {
    const err = await expectInvariantViolation('i6-missing-grant-commit.jsonl');
    assert.equal(err.kind, 'invariant_i6');
    assert.equal(err.track_id, 'i6-violator');
  });

  it('test_when_track_invariant_i8_unknown_skill_then_validator_returns_named_error', async () => {
    const err = await expectInvariantViolation('i8-unknown-skill.jsonl');
    assert.equal(err.kind, 'invariant_i8');
    assert.match(err.message, /this-skill-definitely-does-not-exist/);
  });

  it('test_when_track_invariant_i10_selector_alternates_diverge_depends_on_then_validator_returns_named_error', async () => {
    const err = await expectInvariantViolation('i10-alternates-diverge.jsonl');
    assert.equal(err.kind, 'invariant_i10');
  });

  it('test_when_track_invariant_i11_unknown_predicate_then_validator_returns_named_error', async () => {
    const err = await expectInvariantViolation('i11-unknown-predicate.jsonl');
    assert.equal(err.kind, 'invariant_i11');
    assert.match(err.message, /requires_unicorns/);
  });

  it('test_when_track_schema_field_references_unknown_version_then_validator_returns_named_error', async () => {
    const err = await expectInvariantViolation('unknown-schema-version.jsonl');
    assert.equal(err.kind, 'unknown_schema_version');
    assert.match(err.message, /v99|supported.*version/i);
  });
});
