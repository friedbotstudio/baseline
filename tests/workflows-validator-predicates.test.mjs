// Sanity tests for the predicate vocabulary module. Full invariant coverage
// lives in tests/workflows-validator-invariants.test.mjs (where I11's
// unknown-predicate path runs against the same vocabulary set).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

let predicates;
try {
  predicates = await import(path.join(REPO_ROOT, 'src/cli/workflows-validator-predicates.js'));
} catch (err) {
  throw new Error(
    `src/cli/workflows-validator-predicates.js not yet implemented. Original: ${err.message}`
  );
}

describe('workflows-validator-predicates — v1 vocabulary', () => {
  it('test_when_v1_predicate_set_then_contains_all_five_canonical_names', () => {
    for (const name of [
      'requires_git',
      'requires_user_override',
      'requires_min_components',
      'requires_phase_completed',
      'requires_skill_present',
    ]) {
      assert.equal(predicates.isKnownPredicate(name), true, `${name} must be in V1_PREDICATES`);
    }
  });

  it('test_when_unknown_predicate_name_then_isknownpredicate_returns_false', () => {
    assert.equal(predicates.isKnownPredicate('requires_unicorns'), false);
    assert.equal(predicates.isKnownPredicate(''), false);
  });
});
