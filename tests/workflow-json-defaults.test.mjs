// brainstorm-and-codesign — AC-008
//
// Backward compatibility for in-flight workflows: when workflow.json lacks
// skip_brainstorm and codesign_mode fields (legacy shape), entry skills read
// both as false (defaults applied at read time) and proceed without error.
//
// SUT: .claude/skills/brainstorm/workflow-defaults.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');

let defaults;
try {
  defaults = await import(path.join(REPO_ROOT, '.claude/skills/brainstorm/workflow-defaults.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/brainstorm/workflow-defaults.mjs not yet implemented. Original: ${err.message}`
  );
}

describe('workflow.json field defaults (AC-008)', () => {
  it('test_when_workflow_json_missing_skip_brainstorm_then_default_false', () => {
    const legacy = {
      request: 'old request',
      slug: 'foo',
      track_id: 'intake-full',
      exceptions: [],
      completed: [],
      created_at: 1700000000,
      updated_at: 1700000000,
    };
    const out = defaults.withDefaults(legacy);
    assert.equal(out.skip_brainstorm, false, 'missing skip_brainstorm defaults to false');
    assert.equal(out.codesign_mode, false, 'missing codesign_mode defaults to false');
  });

  it('test_when_workflow_json_has_explicit_true_then_preserved', () => {
    const explicit = {
      slug: 'foo', track_id: 'intake-full', exceptions: [], completed: [],
      skip_brainstorm: true, codesign_mode: true,
    };
    const out = defaults.withDefaults(explicit);
    assert.equal(out.skip_brainstorm, true);
    assert.equal(out.codesign_mode, true);
  });

  it('test_when_workflow_json_has_explicit_false_then_preserved', () => {
    const explicit = {
      slug: 'foo', track_id: 'intake-full', exceptions: [], completed: [],
      skip_brainstorm: false, codesign_mode: false,
    };
    const out = defaults.withDefaults(explicit);
    assert.equal(out.skip_brainstorm, false);
    assert.equal(out.codesign_mode, false);
  });

  it('test_when_workflow_json_partially_present_then_only_missing_fields_defaulted', () => {
    const partial = {
      slug: 'foo', track_id: 'intake-full', exceptions: [], completed: [],
      skip_brainstorm: true,
      // codesign_mode missing
    };
    const out = defaults.withDefaults(partial);
    assert.equal(out.skip_brainstorm, true, 'present field preserved');
    assert.equal(out.codesign_mode, false, 'missing field defaulted');
  });

  it('test_when_withdefaults_called_then_input_object_not_mutated', () => {
    const input = { slug: 'foo' };
    defaults.withDefaults(input);
    assert.equal('skip_brainstorm' in input, false,
      'withDefaults must not mutate its input (returns new object)');
  });
});
