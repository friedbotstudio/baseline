// Skill-helper CLI dispatchers — the shared argv layer and the contract every
// dispatcher owes regardless of which skill directory it lives in (AC-001,
// AC-005, AC-011).
//
// Why a separate file from the per-dispatcher suites: these four assertions are
// about the PARSE and USAGE contract, which is uniform across all four
// dispatchers by spec D6. Testing them once per dispatcher suite would be the
// same claim written four times; testing them here table-driven keeps the
// contract's uniformity visible as a single fact.
//
// Every test opens with assertPresent(). A dispatcher that does not exist makes
// node exit 1, which is also what an unknown subcommand must produce — without
// the presence check, test_when_subcommand_is_unknown would pass against an
// empty repo and never fail again.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tryImport } from './helpers/memory-fixtures.mjs';
import { runCli, assertPresent, DISPATCHERS, ARGV_LIB } from './helpers/cli-runner.mjs';

const DISPATCHER_NAMES = Object.keys(DISPATCHERS);

describe('shared argv layer', () => {
  // AC-001
  it('test_when_argv_parses_subcommand_and_flags_then_returns_parsed_shape', async () => {
    const mod = await tryImport(ARGV_LIB);
    assert.ok(mod, `${ARGV_LIB} must exist and be importable — every dispatcher parses through it (spec D4)`);
    assert.equal(typeof mod.parse, 'function', 'expected named export `parse` to be a function');

    const parsed = mod.parse(['describe', 'scoped-memory', '--json']);
    assert.equal(parsed.subcommand, 'describe');
    assert.deepEqual(parsed.positional, ['scoped-memory']);
    assert.equal(parsed.json, true, '--json must surface as a top-level boolean, not only inside flags');
    assert.equal(parsed.flags.json, true);
  });

  // AC-001
  it('test_when_argv_parses_valued_flag_then_value_is_captured', async () => {
    const mod = await tryImport(ARGV_LIB);
    assert.ok(mod, `${ARGV_LIB} must exist and be importable`);
    assert.equal(typeof mod.parse, 'function', 'expected named export `parse` to be a function');

    const parsed = mod.parse(['blast-radius', 'scoped-memory', '--hops', '2']);
    assert.equal(parsed.subcommand, 'blast-radius');
    assert.deepEqual(parsed.positional, ['scoped-memory']);
    assert.equal(String(parsed.flags.hops), '2');
    assert.equal(parsed.json, false, 'json defaults false so a human-readable default is the contract (spec D6)');
  });
});

describe('usage contract across every dispatcher', () => {
  for (const name of DISPATCHER_NAMES) {
    // AC-005
    it(`test_when_subcommand_is_unknown_then_usage_printed_and_exit_1__${name.replace(/[^\w]/g, '_')}`, () => {
      const res = runCli(name, ['definitely-not-a-subcommand']);
      assertPresent(assert, res);
      assert.equal(res.status, 1, `${res.rel} must exit 1 on an unknown subcommand`);
      assert.match(res.out, /usage/i, 'usage text must name what the caller can run instead');
    });

    // AC-011
    it(`test_when_help_flag_given_then_subcommands_listed_and_exit_0__${name.replace(/[^\w]/g, '_')}`, () => {
      const res = runCli(name, ['--help']);
      assertPresent(assert, res);
      assert.equal(res.status, 0, `${res.rel} --help must exit 0`);
      assert.ok(res.out.trim().length > 0, '--help must print something');
      assert.match(res.out, /usage/i, '--help must show usage');
    });
  }

  // AC-005 — the unknown-subcommand message must be actionable, not a bare code.
  it('test_when_subcommand_is_unknown_then_known_subcommands_are_named', () => {
    const res = runCli('workspace', ['blastradius']);
    assertPresent(assert, res);
    assert.equal(res.status, 1);
    for (const known of ['describe', 'blast-radius', 'graph']) {
      assert.ok(
        res.out.includes(known),
        `usage must name the known subcommand \`${known}\` so a typo is self-correcting; got: ${res.out.slice(0, 400)}`,
      );
    }
  });
});

// The D4 placement rule (one dispatcher per skill directory) is asserted in
// tests/cli-sop-citations.test.mjs against the built manifest, which is real
// build output. A version of that check reading DISPATCHERS from
// tests/helpers/cli-runner.mjs lived here briefly and was removed: every value
// it compared was declared in the same helper it imported them from, so it
// asserted that a constant matches a pattern beside it and could not fail on any
// state of the repository.
