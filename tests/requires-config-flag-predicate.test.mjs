// requires-config-flag predicate — Foundation layer (pure, no filesystem).
//
// Exercises `src/cli/workflows-validator-predicates.js`, the CANONICAL source of
// the v1 predicate vocabulary. `.claude/skills/triage/workflows-validator-predicates.js`
// is a build-time mirror (scripts/build-template.sh Stage 0b) whose byte-equality is
// enforced by tests/vendored-mirror-bytes.test.mjs — never import or edit the mirror.
//
// RED until /implement adds `validatePredicateParams` and `resolveConfigFlag` and
// registers `requires_config_flag` as the SEVENTH member of V1_PREDICATES.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

let predicates;
try {
  predicates = await import(path.join(REPO_ROOT, 'src/cli/workflows-validator-predicates.js'));
} catch (err) {
  throw new Error(
    `Cannot import src/cli/workflows-validator-predicates.js (RED is expected pre-/implement). ` +
    `Original import error: ${err.message}`
  );
}

const { V1_PREDICATES, isKnownPredicate } = predicates;

// Foundation: named exports may not exist yet. Assert their shape before calling so a
// missing export fails with a readable message rather than "x is not a function".
function fn(name) {
  const candidate = predicates[name];
  assert.equal(
    typeof candidate,
    'function',
    `expected named export \`${name}\` to be a function (not yet implemented?)`
  );
  return candidate;
}

const POWER_PARAMS = { path: 'velocity.power_mode.enabled', equals: true };

describe('requires_config_flag — registration', () => {
  // AC-001
  it('test_when_requires_config_flag_registered_then_isKnownPredicate_returns_true', () => {
    assert.equal(isKnownPredicate('requires_config_flag'), true);
  });

  // AC-001
  it('test_when_vocabulary_read_then_it_holds_exactly_seven_predicates', () => {
    assert.equal(V1_PREDICATES.size, 7, `V1_PREDICATES: ${[...V1_PREDICATES].join(', ')}`);
  });
});

describe('requires_config_flag — param well-formedness', () => {
  // AC-001
  it('test_when_path_present_and_equals_missing_then_predicate_params_rejected', () => {
    const error = fn('validatePredicateParams')({ name: 'requires_config_flag', path: 'a.b' });
    assert.notEqual(error, null, 'a requires_config_flag without `equals` must be rejected');
  });

  // AC-001
  it('test_when_path_and_equals_both_present_then_predicate_params_accepted', () => {
    const error = fn('validatePredicateParams')({ name: 'requires_config_flag', ...POWER_PARAMS });
    assert.equal(error, null);
  });

  // AC-001
  it('test_when_sibling_predicate_declares_no_params_then_accepted', () => {
    assert.equal(fn('validatePredicateParams')({ name: 'requires_git' }), null);
  });
});

describe('requires_config_flag — resolution is strict equality', () => {
  // AC-003 — an enabled flag makes the track selectable
  it('test_when_flag_true_and_equals_true_then_resolves_true', () => {
    const project = { velocity: { power_mode: { enabled: true } } };
    assert.equal(fn('resolveConfigFlag')(project, POWER_PARAMS), true);
  });

  // AC-002 — a false flag excludes the track
  it('test_when_flag_false_and_equals_true_then_resolves_false', () => {
    const project = { velocity: { power_mode: { enabled: false } } };
    assert.equal(fn('resolveConfigFlag')(project, POWER_PARAMS), false);
  });

  // AC-002, AC-003 — strict-equality boundary
  it('test_when_equals_false_and_flag_false_then_resolves_true', () => {
    const project = { velocity: { power_mode: { enabled: false } } };
    const params = { path: 'velocity.power_mode.enabled', equals: false };
    assert.equal(
      fn('resolveConfigFlag')(project, params),
      true,
      'a predicate may legitimately assert that a flag is OFF'
    );
  });

  // AC-002, AC-003 — strict-equality boundary
  it('test_when_flag_is_number_one_and_equals_true_then_resolves_false', () => {
    const project = { velocity: { power_mode: { enabled: 1 } } };
    assert.equal(fn('resolveConfigFlag')(project, POWER_PARAMS), false, '=== not ==');
  });

  // AC-002, AC-003 — strict-equality boundary
  it('test_when_flag_is_string_true_and_equals_true_then_resolves_false', () => {
    const project = { velocity: { power_mode: { enabled: 'true' } } };
    assert.equal(fn('resolveConfigFlag')(project, POWER_PARAMS), false, '=== not ==');
  });
});

describe('requires_config_flag — resolution fails safe', () => {
  // AC-011
  it('test_when_key_absent_then_resolves_false', () => {
    assert.equal(fn('resolveConfigFlag')({}, POWER_PARAMS), false);
  });

  // AC-011
  it('test_when_flag_is_null_then_resolves_false', () => {
    const project = { velocity: { power_mode: { enabled: null } } };
    assert.equal(fn('resolveConfigFlag')(project, POWER_PARAMS), false);
  });

  // AC-011
  it('test_when_intermediate_path_segment_missing_then_resolves_false_without_throwing', () => {
    const resolve = fn('resolveConfigFlag');
    assert.equal(resolve({ velocity: null }, POWER_PARAMS), false);
    assert.equal(resolve({ velocity: { power_mode: null } }, POWER_PARAMS), false);
  });

  // AC-011
  it('test_when_project_json_is_malformed_or_not_an_object_then_resolves_false', () => {
    const resolve = fn('resolveConfigFlag');
    for (const malformed of [null, undefined, 'not json', 42, [], true]) {
      assert.equal(
        resolve(malformed, POWER_PARAMS),
        false,
        `resolveConfigFlag(${JSON.stringify(malformed)}) must be false, never throw`
      );
    }
  });

  // AC-011 — params come from workflows.jsonl, as untrusted as project.json
  it('test_when_params_are_missing_or_malformed_then_resolves_false_without_throwing', () => {
    const resolve = fn('resolveConfigFlag');
    const project = { velocity: { power_mode: { enabled: true } } };
    for (const params of [null, undefined, {}, { path: '' }, { equals: true }]) {
      assert.equal(
        resolve(project, params),
        false,
        `resolveConfigFlag(project, ${JSON.stringify(params)}) must be false, never throw`
      );
    }
  });
});
