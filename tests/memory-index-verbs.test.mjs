// The `scope-narrow` and `query` verbs on the memory-index dispatcher — AC-005,
// AC-009, AC-011, AC-012, AC-014 of the read-front-door-sweep ticket.
//
// `query` forwards to `resolveLookup` (memory-index/resolve.mjs); the legal
// `--kind` set is read off that module's source (four kinds, including
// `by_concept`) rather than trusted from the spec's three-kind sequence
// diagram. `scope-narrow` is composed from `proposeNarrowing`
// (memory-index/scope-narrow.mjs) plus `isReachable`/`SCOPE_PLACEHOLDER`
// (resolve.mjs) — scope-narrow.mjs's own report/check live behind a private
// SUBCOMMANDS map and a main-guard and are neither editable nor reachable here.
//
// RED until cli.mjs grows the `query` and `scope-narrow` subcommands.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { makeProject, writeShard, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { runCli, runCliJson, assertKnownSubcommand } from './helpers/cli-runner.mjs';

const NARROW_CLI = join(REPO_ROOT, '.claude/skills/memory-index/scope-narrow.mjs');
const CLI_SOURCE = readFileSync(join(REPO_ROOT, '.claude/skills/memory-index/cli.mjs'), 'utf8');

describe('memory-index query verb (AC-009, AC-011, AC-012)', () => {
  it('test_when_query_runs_with_a_known_kind_then_entries_are_returned', () => {
    const { root, memDir } = makeProject();
    writeShard(memDir, 'decisions', 'rests-on-nojvm', {
      key: 'rests-on-nojvm',
      fields: { rests_on: 'no-jvm', governs: '.claude/hooks/**' },
      bodyLines: ['- Decision: seeded for the query verb.'],
    });

    const res = runCliJson('memory-index', [
      'query', '--kind', 'by_constraint', '--needle', 'no-jvm', '--root', root, '--json',
    ]);
    assertKnownSubcommand(assert, res, 'query');
    assert.equal(res.status, 0, `query must exit 0; got ${res.status}: ${res.out}`);
    assert.ok(res.json, 'stdout must parse as JSON');
    assert.equal(res.json.kind, 'by_constraint');
    assert.equal(res.json.needle, 'no-jvm');
    assert.ok(
      res.json.entries.some((e) => e.key === 'rests-on-nojvm'),
      'the seeded entry must be present in entries',
    );
  });

  it('test_when_query_kind_unknown_then_exit_one_names_the_legal_kinds', () => {
    const { root } = makeProject();
    const res = runCli('memory-index', [
      'query', '--kind', 'by_bogus', '--needle', 'anything', '--root', root,
    ]);
    assertKnownSubcommand(assert, res, 'query');
    assert.equal(res.status, 1, 'an unknown --kind must exit 1');
    for (const kind of ['by_path', 'by_constraint', 'by_element', 'by_concept']) {
      assert.ok(res.out.includes(kind), `the rejection must name the legal kind \`${kind}\` (read off resolveLookup, not the spec diagram)`);
    }
  });

  it('test_when_query_needle_missing_value_then_usage_error_exit_one', () => {
    const { root } = makeProject();
    // `--needle` is last with nothing after it, so the parser gives it the
    // boolean `true` rather than a string value (argv.mjs's requireValue trap).
    const res = runCli('memory-index', [
      'query', '--kind', 'by_element', '--root', root, '--needle',
    ]);
    assertKnownSubcommand(assert, res, 'query');
    assert.equal(res.status, 1, 'a valueless --needle must exit 1');
    assert.match(res.out, /--needle requires a value/, 'the rejection must be the requireValue message');
  });

  it('test_when_query_matches_nothing_then_empty_entries_and_exit_zero', () => {
    const { root, memDir } = makeProject();
    writeShard(memDir, 'decisions', 'rests-on-nojvm', {
      key: 'rests-on-nojvm',
      fields: { rests_on: 'no-jvm' },
      bodyLines: ['- Decision: seeded for the query verb.'],
    });

    const res = runCliJson('memory-index', [
      'query', '--kind', 'by_constraint', '--needle', 'no-such-constraint', '--root', root, '--json',
    ]);
    assertKnownSubcommand(assert, res, 'query');
    assert.equal(res.status, 0, 'absence is not an error — exit 0');
    assert.deepEqual(res.json.entries, [], 'no match yields an empty entries array, not a refusal');
  });
});

describe('memory-index scope-narrow verb (AC-005)', () => {
  it('test_when_scope_narrow_verb_and_direct_helper_run_then_payloads_match', () => {
    const { root, memDir } = makeProject();
    writeShard(memDir, 'decisions', 'governs-hooks', {
      key: 'governs-hooks',
      fields: { governs: '.claude/hooks/**' },
      bodyLines: ['- Decision: hooks stay advisory.'],
    });

    const viaCli = runCliJson('memory-index', ['scope-narrow', 'report', '--root', root, '--json']);
    assertKnownSubcommand(assert, viaCli, 'scope-narrow');
    assert.equal(viaCli.status, 0, `cli scope-narrow report must exit 0; got ${viaCli.status}: ${viaCli.out}`);

    const direct = spawnSync(process.execPath, [NARROW_CLI, 'report'], { cwd: root, encoding: 'utf8' });
    assert.equal(direct.status, 0, `direct scope-narrow.mjs report must exit 0; got ${direct.status}: ${direct.stdout}${direct.stderr}`);

    const directRows = direct.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, governs, evidence] = line.split('\t');
        return { id, governs, evidence };
      });
    const cliRows = viaCli.json.rows.map((r) => ({
      id: `${r.category}/${r.key}`,
      governs: r.governs.join(', '),
      evidence: r.evidence,
    }));

    assert.deepEqual(cliRows, directRows, 'cli.mjs scope-narrow report and the direct helper must agree on payload');
  });

  it('test_when_scope_narrow_direct_path_invoked_then_main_guard_still_fires', () => {
    const { root, memDir } = makeProject();
    writeShard(memDir, 'decisions', 'governs-hooks', {
      key: 'governs-hooks',
      fields: { governs: '.claude/hooks/**' },
      bodyLines: ['- Decision: hooks stay advisory.'],
    });

    const report = spawnSync(process.execPath, [NARROW_CLI, 'report'], { cwd: root, encoding: 'utf8' });
    assert.equal(report.status, 0, 'the direct report path must still run and exit 0');

    const check = spawnSync(process.execPath, [NARROW_CLI, 'check'], { cwd: root, encoding: 'utf8' });
    assert.equal(check.status, 0, 'the direct check path must still run and exit 0 when every entry is reachable');
    assert.match(check.stdout, /every entry is reachable/, 'the direct check path prints its original message');
  });
});

describe('memory-index verbs — JSON discipline and delegation (AC-011, AC-014)', () => {
  it('test_when_verbs_run_with_json_then_stdout_is_parseable_json_only', () => {
    const { root, memDir } = makeProject();
    writeShard(memDir, 'decisions', 'governs-hooks', {
      key: 'governs-hooks',
      fields: { governs: '.claude/hooks/**', rests_on: 'no-jvm' },
      bodyLines: ['- Decision: hooks stay advisory.'],
    });

    const queryRes = runCli('memory-index', [
      'query', '--kind', 'by_constraint', '--needle', 'no-jvm', '--root', root, '--json',
    ]);
    assertKnownSubcommand(assert, queryRes, 'query');
    assert.doesNotThrow(() => JSON.parse(queryRes.stdout), 'query --json must emit parseable JSON on stdout, nothing else');

    const scopeRes = runCli('memory-index', ['scope-narrow', 'report', '--root', root, '--json']);
    assertKnownSubcommand(assert, scopeRes, 'scope-narrow');
    assert.doesNotThrow(() => JSON.parse(scopeRes.stdout), 'scope-narrow report --json must emit parseable JSON on stdout, nothing else');
  });

  it('test_when_verb_source_read_then_it_delegates_rather_than_reimplements', () => {
    assert.match(CLI_SOURCE, /from '\.\/resolve\.mjs'/, 'cli.mjs must import from resolve.mjs');
    assert.match(CLI_SOURCE, /from '\.\/scope-narrow\.mjs'/, 'cli.mjs must import from scope-narrow.mjs');

    // resolveLookup's own internal branching must not be copied into the CLI —
    // the CLI calls resolveLookup, it does not reimplement its dispatch.
    assert.ok(!CLI_SOURCE.includes('resolveConcept'), "cli.mjs must not copy resolveLookup's internal by_concept branch");
    assert.ok(!CLI_SOURCE.includes('resolveTouchedPath'), "cli.mjs must not copy resolveLookup's internal by_path branch");
    assert.ok(!CLI_SOURCE.includes('matchesGlob'), 'cli.mjs must not reimplement the glob-matching leg of resolveLookup');

    // scope-narrow.mjs's own evidence-derivation regexes must not be copied
    // either — the CLI calls proposeNarrowing, it does not re-derive evidence.
    assert.ok(!CLI_SOURCE.includes('PATH_SHAPED_KEY'), "cli.mjs must not copy scope-narrow.mjs's evidence regex");
    assert.ok(!CLI_SOURCE.includes('BODY_ANCHOR'), "cli.mjs must not copy scope-narrow.mjs's evidence regex");
  });
});

// Security review 2026-08-09, finding F-1 (CWE-22). `--spec-dir` is caller input
// that reaches a directory read through conceptLayer(). memory-sync/cli.mjs guards
// the identical flag and its comment names this exact failure: "Two dispatchers
// accepting the flag with only one checking it is how a traversal survives a
// review." This suite is the guard on that claim for the second dispatcher.
describe('AC-015 — query rejects a traversing --spec-dir', () => {
  it('test_when_spec_dir_traverses_then_it_is_rejected_not_normalized', () => {
    const { root } = makeProject();
    const res = runCli('memory-index', [
      'query', '--kind', 'by_concept', '--needle', 'anything', '--spec-dir', '../../../etc',
    ], { cwd: root });

    assertKnownSubcommand(assert, res, 'query');
    assert.equal(res.status, 1, 'a traversing --spec-dir must exit 1, not resolve');
    assert.match(res.stderr + res.stdout, /traversal/i, 'the refusal names the reason');
  });

  it('test_when_spec_dir_is_relative_and_safe_then_it_is_accepted', () => {
    const { root } = makeProject();
    const res = runCli('memory-index', [
      'query', '--kind', 'by_element', '--needle', 'nothing-matches', '--spec-dir', 'docs/system',
    ], { cwd: root });

    assert.equal(res.status, 0, 'an ordinary relative --spec-dir still works');
  });

  it('test_when_sibling_dispatcher_guards_the_flag_then_this_one_does_too', () => {
    // Both dispatchers accept --spec-dir and both reach a path join. Asserting the
    // pair together is what stops the guard being re-dropped from one of them.
    const { root } = makeProject();
    for (const name of ['memory-sync', 'memory-index']) {
      const args = name === 'memory-sync'
        ? ['stale-elements', '--spec-dir', '../../../etc']
        : ['query', '--kind', 'by_concept', '--needle', 'x', '--spec-dir', '../../../etc'];
      const res = runCli(name, args, { cwd: root });
      assert.equal(res.status, 1, `${name} must refuse a traversing --spec-dir`);
    }
  });
});

// Security review 2026-08-09, "Out of scope / Noted". resolveLookup is triply
// polymorphic: an ARRAY for by_constraint/by_element, an OBJECT {elements,concepts}
// for by_path/by_concept, and an ARRAY again for those two when no corpus layer
// resolves. The verb forwarded that shape straight out, so `entries.length` was
// undefined on the object branch and the human-readable path printed "(no entries)"
// while 18 elements had in fact resolved. The CLI owns its own output contract; it
// normalizes here so a consumer — the GUI this batch exists for — sees one shape.
describe('AC-009 — query emits one stable shape across every kind', () => {
  it('test_when_kind_is_concept_then_entries_is_an_array_and_concepts_are_reported', () => {
    const res = runCliJson('memory-index', [
      'query', '--kind', 'by_concept', '--needle', 'memory-model', '--spec-dir', 'docs/system', '--json',
    ]);

    assert.ok(res.json, 'emits parseable JSON');
    assert.ok(Array.isArray(res.json.entries), 'entries is an array for by_concept, not an object');
    assert.ok(res.json.entries.length > 0, 'the live corpus resolves members for memory-model');
    assert.ok(Array.isArray(res.json.concepts), 'the matched concepts are reported in their own field');
  });

  it('test_when_kind_is_concept_and_matches_then_text_path_does_not_claim_no_entries', () => {
    const res = runCli('memory-index', [
      'query', '--kind', 'by_concept', '--needle', 'memory-model', '--spec-dir', 'docs/system',
    ]);

    assert.equal(res.status, 0);
    assert.ok(!/\(no entries\)/.test(res.stdout),
      'the text path must not report "(no entries)" when the lookup resolved members');
  });

  it('test_when_every_kind_runs_then_entries_is_always_an_array', () => {
    for (const kind of ['by_path', 'by_constraint', 'by_element', 'by_concept']) {
      const res = runCliJson('memory-index', [
        'query', '--kind', kind, '--needle', 'no-such-thing-anywhere', '--spec-dir', 'docs/system', '--json',
      ]);
      assert.ok(Array.isArray(res.json?.entries), `entries must be an array for --kind ${kind}`);
      assert.ok(Array.isArray(res.json?.concepts), `concepts must be an array for --kind ${kind}`);
    }
  });
});
