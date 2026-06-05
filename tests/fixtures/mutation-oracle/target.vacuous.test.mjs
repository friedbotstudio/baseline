// DELIBERATELY VACUOUS test (AC-002 fixture). It executes the functions but
// asserts almost nothing about their behavior — so mutating the conditionals /
// arithmetic in target.mjs leaves SURVIVING mutants that pass/fail cannot catch.
// The mutation oracle must surface those survivors where this green test cannot.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classify, double } from './target.mjs';

describe('target (vacuous)', () => {
  it('functions are callable', () => {
    // Calls the code (so it is "covered") but does not assert the actual result.
    classify(5);
    classify(-5);
    classify(0);
    double(3);
    assert.ok(typeof classify === 'function');
    assert.ok(typeof double === 'function');
  });
});
