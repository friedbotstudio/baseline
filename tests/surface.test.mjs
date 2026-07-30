// src/cli/surface.js is the machine-readable description of the CLI: its
// commands, its flags, and its exit codes. The rendered docs site reads it via
// site-src/_data/cli.cjs so the CLI reference page cannot drift from the
// binary the way a hand-typed table does.
//
// It is deliberately NOT imported by bin/cli.js. The argv parser has six test
// files sitting on it, and composing HELP_TEXT from this module would put a
// documentation copy edit on the npm release path and give a bug here a way to
// break the CLI. The cost of that choice is two copies of the flag list, and
// the job of this suite is to make the second copy honest: every assertion
// below compares surface.js against what bin/cli.js and src/cli/merge.js
// actually do.
//
// OPTIONS is read out of bin/cli.js source rather than imported because
// bin/cli.js calls main() at module scope; importing it would run the CLI.
// tests/docsite-flag-coverage.test.mjs parses it the same way.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMANDS, FLAGS, EXIT_CODES } from '../src/cli/surface.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepo = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// Parse `const OPTIONS = { ... };` into { name: {type, short} }.
function parseOptions(source) {
  const block = /const OPTIONS = \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(block, 'bin/cli.js must declare the OPTIONS object');
  const entries = {};
  const re = /^\s*'?([a-z][a-z0-9-]*)'?:\s*\{([^}]*)\}/gm;
  for (const m of block[1].matchAll(re)) {
    const body = m[2];
    const type = /type:\s*'([a-z]+)'/.exec(body);
    const short = /short:\s*'([^']+)'/.exec(body);
    entries[m[1]] = { type: type ? type[1] : null, short: short ? short[1] : null };
  }
  assert.ok(Object.keys(entries).length >= 5, 'expected the parseArgs option set');
  return entries;
}

const OPTIONS = parseOptions(readRepo('bin/cli.js'));

describe('FLAGS mirrors the parseArgs OPTIONS set exactly', () => {
  it('test_when_flags_listed_then_ids_match_options_keys_both_ways', () => {
    // Set equality, not subset. A flag removed from OPTIONS but left in
    // surface.js would document a flag that no longer parses, which is the
    // more confusing direction of drift.
    assert.deepEqual(
      FLAGS.map((f) => f.id).sort(),
      Object.keys(OPTIONS).sort(),
    );
  });

  it('test_when_flag_declares_a_type_then_it_matches_the_parser', () => {
    for (const flag of FLAGS) {
      assert.equal(flag.type, OPTIONS[flag.id].type, `${flag.id} type`);
    }
  });

  it('test_when_flag_declares_a_short_form_then_it_matches_the_parser', () => {
    for (const flag of FLAGS) {
      assert.equal(flag.short ?? null, OPTIONS[flag.id].short, `${flag.id} short form`);
    }
  });

  it('test_when_flag_rendered_then_cli_spelling_is_the_id_double_dashed', () => {
    for (const flag of FLAGS) {
      assert.equal(flag.cli, `--${flag.id}`, `${flag.id} cli spelling`);
    }
  });

  it('test_when_flag_documented_then_it_carries_a_summary_and_a_group', () => {
    for (const flag of FLAGS) {
      assert.ok(flag.summary && flag.summary.length > 10, `${flag.id} needs a summary`);
      assert.ok(flag.group, `${flag.id} needs a group`);
    }
  });
});

describe('COMMANDS covers the dispatch table in bin/cli.js', () => {
  const cliSource = readRepo('bin/cli.js');

  it('test_when_subcommand_dispatched_in_cli_then_it_is_documented', () => {
    // bin/cli.js dispatches on positionals[0]; anything else is the install path.
    const dispatched = [...cliSource.matchAll(/positionals\[0\] === '([a-z-]+)'/g)].map((m) => m[1]);
    assert.ok(dispatched.length >= 2, `expected subcommand dispatch, got: ${dispatched}`);
    const documented = COMMANDS.map((c) => c.id);
    for (const name of dispatched) {
      assert.ok(documented.includes(name), `${name} is dispatched but not in COMMANDS`);
    }
    // The default (no subcommand) install path must be documented too.
    assert.ok(documented.includes('install'), 'the default install path must be documented');
  });

  it('test_when_command_documented_then_it_carries_usage_and_summary', () => {
    for (const c of COMMANDS) {
      assert.ok(c.usage && c.usage.includes('create-baseline'), `${c.id} needs a usage line`);
      assert.ok(c.summary && c.summary.length > 10, `${c.id} needs a summary`);
    }
  });
});

describe('EXIT_CODES covers every code the CLI can actually return', () => {
  it('test_when_code_returned_anywhere_then_it_is_documented', () => {
    // Two sources of truth: literal `return N` in bin/cli.js, and the codes
    // computeExitCode() can produce in src/cli/merge.js. Exit 3 exists ONLY in
    // merge.js, so scanning bin/cli.js alone would silently under-report.
    const fromCli = [...readRepo('bin/cli.js').matchAll(/return (\d);/g)].map((m) => Number(m[1]));
    const fromMerge = [...readRepo('src/cli/merge.js').matchAll(/Math\.max\(code, (\d)\)/g)]
      .map((m) => Number(m[1]));
    const reachable = [...new Set([...fromCli, ...fromMerge, 0])].sort();
    const documented = EXIT_CODES.map((e) => e.code).sort();
    for (const code of reachable) {
      assert.ok(documented.includes(code), `exit ${code} is reachable but undocumented`);
    }
    assert.ok(reachable.includes(3), 'guard: exit 3 must be discoverable from merge.js');
  });

  it('test_when_codes_documented_then_they_are_unique_and_contiguous_from_zero', () => {
    const codes = EXIT_CODES.map((e) => e.code);
    assert.deepEqual(codes, [...new Set(codes)], 'exit codes must be unique');
    assert.deepEqual([...codes].sort((a, b) => a - b), codes, 'exit codes must be listed in order');
    assert.equal(codes[0], 0);
    assert.equal(codes[codes.length - 1], codes.length - 1, 'no gaps in the documented range');
  });

  it('test_when_code_documented_then_it_carries_a_meaning', () => {
    for (const e of EXIT_CODES) {
      assert.ok(e.meaning && e.meaning.length > 5, `exit ${e.code} needs a meaning`);
    }
  });
});

describe('the surface is immutable', () => {
  it('test_when_module_loaded_then_every_export_is_frozen_deeply', () => {
    for (const [name, coll] of [['COMMANDS', COMMANDS], ['FLAGS', FLAGS], ['EXIT_CODES', EXIT_CODES]]) {
      assert.ok(Object.isFrozen(coll), `${name} must be frozen`);
      for (const entry of coll) {
        assert.ok(Object.isFrozen(entry), `each ${name} entry must be frozen`);
      }
    }
  });
});
