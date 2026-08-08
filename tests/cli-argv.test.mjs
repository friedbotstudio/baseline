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
import { runCli, assertPresent, DISPATCHERS, ARGV_LIB, OUTPUT_LIB } from './helpers/cli-runner.mjs';

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

// ─── dispatcher sweep: the flag vocabulary (AC-016) ───
//
// VALUE_FLAGS is one shared union in a Foundation module, and that is the whole
// hazard. Under `strict: false` an UNDECLARED `--kind sequence` parses as
// `kind: true` and leaks `sequence` into positionals — the value is discarded
// silently and the subcommand sees a positional it never expected. Six flags are
// added here, so six new ways to fail quietly.
//
// Table-driven over the names rather than one test per flag: the claim is that the
// vocabulary is uniform, and six near-identical tests would state that six times
// while making it easy to add a seventh flag and no seventh test.

const ADDED_VALUE_FLAGS = ['slug', 'kind', 'mem-dir', 'surface', 'delegate', 'touched'];

describe('added value flags parse their values', () => {
  // AC-016
  it('test_when_added_value_flag_passed_with_value_then_value_lands_and_positionals_clean', async () => {
    const mod = await tryImport(ARGV_LIB);
    assert.ok(mod && typeof mod.parse === 'function', `${ARGV_LIB} must export parse`);

    const failures = [];
    for (const name of ADDED_VALUE_FLAGS) {
      const parsed = mod.parse(['somecmd', `--${name}`, 'thevalue', 'apositional']);
      if (parsed.flags[name] !== 'thevalue') {
        failures.push(`--${name}: flags[${name}] === ${JSON.stringify(parsed.flags[name])}, want "thevalue" (undeclared flags parse as true)`);
      }
      if (parsed.positional.includes('thevalue')) {
        failures.push(`--${name}: the value leaked into positionals, which is how the discard goes unnoticed`);
      }
      if (!parsed.positional.includes('apositional')) {
        failures.push(`--${name}: a real positional was swallowed`);
      }
    }
    assert.deepEqual(failures, [], 'every value-taking flag must be declared in VALUE_FLAGS, or its value is silently discarded');
  });

  // AC-016
  it('test_when_existing_value_flags_still_parse_then_the_four_shipped_dispatchers_are_unaffected', async () => {
    const mod = await tryImport(ARGV_LIB);
    assert.ok(mod && typeof mod.parse === 'function', `${ARGV_LIB} must export parse`);

    const shipped = ['root', 'spec-dir', 'hops', 'jar', 'key', 'disposition', 'state', 'governs'];
    const broken = shipped.filter((name) => mod.parse(['c', `--${name}`, 'v']).flags[name] !== 'v');
    assert.deepEqual(broken, [], 'extending the vocabulary must not disturb the eight flags the shipped dispatchers already use');
  });
});

// ─── the presentation split (lib/output.mjs) ───
//
// argv.mjs held two concerns: parsing argv + owning the exit contract, and
// rendering what the caller sees. The code-review file-length oracle is what
// surfaced it, but the split stands on the layer model: `renderUsage` and `emit`
// consult no argv and decide no exit code — they turn a value into bytes.
//
// `renderUsage` stays re-exported from argv.mjs. It shipped as a public export in
// 4cc46e0, so dropping it would break a consumer that already imports it; the
// re-export makes the move invisible from outside. `emit` was module-private and
// becomes public here, because a module that owns writing must expose the write.

describe('dispatcher output module', () => {
  it('test_when_output_module_imported_then_it_owns_usage_and_emit', async () => {
    const mod = await tryImport(OUTPUT_LIB);
    assert.ok(mod, `${OUTPUT_LIB} must exist — argv.mjs delegates its rendering to it`);
    assert.equal(typeof mod.renderUsage, 'function', 'expected named export `renderUsage`');
    assert.equal(typeof mod.emit, 'function', 'expected named export `emit`');
  });

  it('test_when_argv_reexports_render_usage_then_the_shipped_export_is_unbroken', async () => {
    const argv = await tryImport(ARGV_LIB);
    const output = await tryImport(OUTPUT_LIB);
    assert.ok(argv && output, 'both halves must import');
    assert.equal(typeof argv.renderUsage, 'function', 'argv.mjs must keep exporting renderUsage (shipped in 4cc46e0)');
    assert.equal(
      argv.renderUsage,
      output.renderUsage,
      're-export must be the SAME function, not a second copy that can drift',
    );
  });

  it('test_when_usage_rendered_then_subcommands_and_shared_flags_are_named', async () => {
    const mod = await tryImport(OUTPUT_LIB);
    assert.ok(mod, `${OUTPUT_LIB} must exist`);

    const text = mod.renderUsage('workspace', {
      describe: { summary: 'describe an element' },
      'blast-radius': { summary: 'what a change touches' },
    });
    assert.match(text, /usage: node \.claude\/skills\/workspace\/cli\.mjs <subcommand>/);
    assert.match(text, /describe\s+describe an element/, 'each subcommand is named with its summary');
    assert.match(text, /blast-radius\s+what a change touches/);
    assert.match(text, /--json/, 'the shared flags block must survive the move');
  });

  it('test_when_emit_given_json_then_data_is_written_and_text_is_ignored', async () => {
    const mod = await tryImport(OUTPUT_LIB);
    assert.ok(mod, `${OUTPUT_LIB} must exist`);

    const written = [];
    const sink = { write: (chunk) => written.push(chunk) };

    mod.emit({ text: 'human form', data: { ok: true } }, true, sink);
    assert.equal(written.join(''), `${JSON.stringify({ ok: true }, null, 2)}\n`);
  });

  it('test_when_emit_given_text_then_it_is_written_verbatim_without_a_trailing_newline', async () => {
    const mod = await tryImport(OUTPUT_LIB);
    assert.ok(mod, `${OUTPUT_LIB} must exist`);

    const written = [];
    const sink = { write: (chunk) => written.push(chunk) };

    // A subcommand whose output IS an artifact (a composed PlantUML document)
    // must stay byte-identical to what the Domain module produced.
    mod.emit({ text: '@startuml\n@enduml' }, false, sink);
    assert.equal(written.join(''), '@startuml\n@enduml', 'emit must not append to an artifact payload');

    written.length = 0;
    mod.emit({}, false, sink);
    assert.equal(written.join(''), '', 'a result with no text writes nothing');
  });
});
