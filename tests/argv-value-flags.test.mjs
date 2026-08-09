// T-001 / AC-010 — every value-taking flag the read-front-door sweep introduces is
// declared in the shared dispatcher's flag vocabulary.
//
// Why this is a test and not a code comment: `parseArgs` runs with `strict: false`,
// so an UNDECLARED `--epic 6` does not error. It parses as the boolean `epic: true`
// and silently drops `6` into positionals. The handler then filters by `true`,
// returns everything, and nothing anywhere reports a fault. A missing declaration is
// therefore invisible at runtime — the only place it can be caught is here.
//
// The assertion is behavioural rather than a peek at the VALUE_FLAGS constant.
// Exporting that array to test it would widen the module's surface for the test's
// convenience, and the constant is not the contract — "`--epic 6` means epic=6" is.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parse, requireValue, UsageError } from '../.claude/skills/lib/argv.mjs';

// Every value-taking flag this batch adds, with the verb that needs it. Adding a
// flag to a dispatcher without adding it here is the omission AC-010 forbids.
const BATCH_FLAGS = [
  ['epic', 'roadmap tasks --epic 6'],
  ['status', 'roadmap tasks --status planned'],
  ['needle', 'memory-index query --needle <path>'],
  ['mode', 'memory-sync sweep --mode backlog-decay'],
];

// Flags that predate this batch. They are re-asserted because the fix edits the
// shared VALUE_FLAGS array, and a careless edit that drops one would otherwise
// surface as an unrelated dispatcher breaking days later.
const PRE_EXISTING_FLAGS = [
  'root', 'spec-dir', 'hops', 'jar', 'key', 'disposition', 'state', 'governs',
  'slug', 'kind', 'mem-dir', 'surface', 'delegate', 'touched', 'label',
];

describe('AC-010 — batch value-flags are declared', () => {
  for (const [flag, usage] of BATCH_FLAGS) {
    it(`test_when_${flag}_flag_given_a_value_then_value_is_captured_not_leaked_to_positionals`, () => {
      const { flags, positional } = parse(['somesub', `--${flag}`, 'VALUE']);

      assert.equal(
        flags[flag],
        'VALUE',
        `--${flag} must capture its value (${usage}); got ${JSON.stringify(flags[flag])}`,
      );
      assert.deepEqual(
        positional,
        [],
        `--${flag}'s value must not leak into positionals — that is the strict:false hazard`,
      );
    });
  }

  it('test_when_batch_flags_combined_then_each_keeps_its_own_value', () => {
    const { flags, positional } = parse([
      'tasks', '--epic', '6', '--status', 'planned', '--json',
    ]);

    assert.equal(flags.epic, '6');
    assert.equal(flags.status, 'planned');
    assert.equal(flags.json, true, '--json stays a boolean flag');
    assert.deepEqual(positional, [], 'no value leaks when several flags combine');
  });
});

describe('AC-010 — pre-existing flags are not disturbed', () => {
  for (const flag of PRE_EXISTING_FLAGS) {
    it(`test_when_${flag.replace(/-/g, '_')}_flag_given_a_value_then_value_is_still_captured`, () => {
      const { flags, positional } = parse(['somesub', `--${flag}`, 'VALUE']);

      assert.equal(flags[flag], 'VALUE', `--${flag} predates this batch and must keep working`);
      assert.deepEqual(positional, []);
    });
  }
});

describe('AC-012 — a declared flag with no value is still a usage error', () => {
  for (const [flag] of BATCH_FLAGS) {
    it(`test_when_${flag}_flag_has_no_value_then_require_value_throws_usage_error`, () => {
      const { flags } = parse(['somesub', `--${flag}`]);

      // Declaring a flag in VALUE_FLAGS does NOT fix the bare-flag case: `--mode`
      // with nothing behind it still parses as boolean true. requireValue is the
      // second half of the guard, and it must keep firing.
      assert.throws(
        () => requireValue(flags, flag),
        (error) => error instanceof UsageError && error.message === `--${flag} requires a value`,
        `--${flag} with no value must raise a named UsageError, not a type error three frames down`,
      );
    });
  }
});
