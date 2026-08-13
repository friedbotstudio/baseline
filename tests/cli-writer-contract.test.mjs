// Dispatcher sweep — the writer contract W-1..W-5 (AC-007..AC-011).
//
// This file exists because the prior pass deferred exactly this. 4cc46e0 shipped
// nine READ subcommands, so "what happens when argv reaches a write" was never
// answered; the spec's Non-goals recorded the gap and this spec closes it with one
// contract applied to all five write paths rather than five ad-hoc validations.
//
// Every assertion is written against the CONTRACT, not against one subcommand, and
// most are table-driven over all five paths. A guard that holds for `digest` and
// not for `shards` is the failure mode this shape is chosen to catch — testing the
// archetype only would let the weakest of the five be the real one.
//
// On proving "rejected BEFORE any path was constructed" without an fs spy: the
// discriminator is the message. Validation that precedes I/O names the unsafe
// input; an implementation that joins first surfaces ENOENT with a resolved path.
// The house established that reading in cli-workspace.test.mjs; the tree snapshot
// is the second half — a rejection that still created a directory is not a
// rejection.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';
import { writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';
import { runCli, assertPresent, assertKnownSubcommand, subcommandUnknown, makeCliProject, snapshotDir } from './helpers/cli-runner.mjs';

const mkdtemp = () => mkdtempSync(join(tmpdir(), 'wcontract-'));

// The five write paths, each expressed as the argv that reaches it. `idAt` is the
// index of the argument a traversal attempt is injected into.
const WRITE_PATHS = [
  { name: 'digest', argv: ['digest', 'alpha'], idAt: 1 },
  { name: 'shards', argv: ['shards', 'alpha', '--kind', 'sequence'], idAt: 1 },
  { name: 'delta', argv: ['delta', '--slug', 'demo'], idAt: 2 },
  // `restore-shards` sweeps the whole diagrams directory, so it takes no id and
  // `idAt: null` opts it out of the traversal table below rather than out of the
  // contract — W-2 and W-3 still bind it, which is the point of the shared table.
  { name: 'restore-shards', argv: ['restore-shards'], idAt: null },
];

const TRAVERSALS = ['../../etc/passwd', 'a/../../b', '/etc/passwd'];

function seeded() {
  const { root, specDir } = makeCliProject({}, mkdtemp);
  writeWorkspaceElement(specDir, 'alpha', { anchor: '.claude/skills/alpha/*.mjs' });
  return { root, specDir };
}

describe('W-1 — validate at the boundary, REJECT never normalize', () => {
  // AC-007
  it('test_when_write_subcommand_given_traversal_id_then_rejected_before_path_construction', () => {
    const failures = [];
    for (const { name, argv, idAt } of WRITE_PATHS) {
      if (idAt === null) continue;
      for (const attack of TRAVERSALS) {
        const { root, specDir } = seeded();
        const before = snapshotDir(specDir);
        const attempt = argv.map((a, i) => (i === idAt ? attack : a));
        const res = runCli('workspace', [...attempt, '--root', root, '--spec-dir', specDir], { cwd: root });
        if (res.missing) { failures.push(`${name}: dispatcher absent`); continue; }
        if (subcommandUnknown(res)) { failures.push(`${name}: not a known subcommand, so its rejection cannot be asserted`); continue; }

        if (res.status !== 1) failures.push(`${name} ${attack}: exit ${res.status}, want 1`);
        if (/ENOENT|no such file/i.test(res.out)) {
          failures.push(`${name} ${attack}: surfaced ENOENT, so the path was built before it was checked`);
        }
        const after = snapshotDir(specDir);
        if (JSON.stringify(after) !== JSON.stringify(before)) failures.push(`${name} ${attack}: mutated the corpus`);
      }
    }
    assert.deepEqual(failures, [], 'every write path must reject traversal identically — the contract is shared, so a per-path exception is a hole');
  });

  // AC-007 — input boundary
  it('test_when_element_id_empty_or_unicode_or_overlong_then_rejected', () => {
    const bad = ['', '  ', 'élément', 'a'.repeat(300), 'has space', 'UPPER'];
    const failures = [];
    for (const id of bad) {
      const { root, specDir } = seeded();
      const res = runCli('workspace', ['digest', id, '--root', root, '--spec-dir', specDir], { cwd: root });
      if (res.missing) { failures.push('dispatcher absent'); break; }
      if (subcommandUnknown(res)) { failures.push('digest is not a known subcommand, so id validation cannot be asserted'); break; }
      if (res.status === 0) failures.push(`${JSON.stringify(id)} was accepted`);
    }
    assert.deepEqual(failures, [], 'assertSafeSlug governs element ids at the CLI boundary exactly as it does in-process');
  });
});

describe('W-2 — the flag gate precedes the write', () => {
  // AC-008
  it('test_when_architecture_map_disabled_then_writers_report_written_false_and_touch_nothing', () => {
    const failures = [];
    for (const { name, argv } of WRITE_PATHS) {
      const { root, specDir } = makeCliProject({ enabled: false }, mkdtemp);
      writeWorkspaceElement(specDir, 'alpha', { anchor: '.claude/skills/alpha/*.mjs' });
      const before = snapshotDir(specDir);

      const res = runCli('workspace', [...argv, '--root', root, '--spec-dir', specDir], { cwd: root });
      if (res.missing) { failures.push(`${name}: dispatcher absent`); continue; }

      if (res.status !== 0) failures.push(`${name}: exit ${res.status}, want 0 — an un-opted-in project is not an error`);
      if (!/written[^a-z]*false|no-?op|not enabled|disabled/i.test(res.out)) {
        failures.push(`${name}: must SAY it did nothing; a silent exit 0 is indistinguishable from a successful write`);
      }
      if (JSON.stringify(snapshotDir(specDir)) !== JSON.stringify(before)) failures.push(`${name}: wrote with the map off`);
    }
    assert.deepEqual(failures, [], 'a project that never opted into the architecture map must be untouched by every corpus writer');
  });
});

describe('W-3 — one invocation writes one thing', () => {
  // AC-009
  it('test_when_write_subcommand_given_all_flag_then_rejected_naming_one_per_invocation', () => {
    const failures = [];
    for (const { name, argv } of WRITE_PATHS) {
      const { root, specDir } = seeded();
      const res = runCli('workspace', [...argv, '--all', '--root', root, '--spec-dir', specDir], { cwd: root });
      if (res.missing) { failures.push(`${name}: dispatcher absent`); continue; }
      if (subcommandUnknown(res)) { failures.push(`${name}: not a known subcommand, so the --all refusal cannot be asserted`); continue; }
      if (res.status !== 1) failures.push(`${name}: --all exited ${res.status}, want 1`);
      if (!/one|single|exactly/i.test(res.out)) failures.push(`${name}: the refusal must name the one-per-invocation rule`);
    }
    assert.deepEqual(failures, [], 'a bulk re-stamp would make every element permanently fresh and launder the drift the digest exists to catch');
  });

  // AC-009
  it('test_when_write_subcommand_given_second_positional_then_rejected', () => {
    const { root, specDir } = seeded();
    writeWorkspaceElement(specDir, 'beta', { anchor: '.claude/skills/beta/*.mjs' });
    const res = runCli('workspace', ['digest', 'alpha', 'beta', '--root', root, '--spec-dir', specDir], { cwd: root });
    assertKnownSubcommand(assert, res, 'digest');
    assert.equal(res.status, 1, 'a second id must be refused, never silently ignored in favour of the first');
  });
});

describe('W-4 — the confirm half stays with the caller', () => {
  // AC-010
  //
  // Two legs, and the source scan is the load-bearing one. An exit-code assertion
  // proves that ONE spelling of the confirm flag was rejected; it says nothing
  // about whether the function is wired behind a different spelling. Proving the
  // symbol is absent from every CLI file proves the capability was never built.
  it('test_when_confirm_attempted_then_rejected_and_confirm_half_unreachable_from_cli', async () => {
    const { root, specDir } = seeded();
    for (const argv of [['sync', '--confirm'], ['placement', 'thing', '--confirm']]) {
      const res = runCli('workspace', [...argv, '--root', root, '--spec-dir', specDir], { cwd: root });
      assertKnownSubcommand(assert, res, argv[0]);
      assert.notEqual(res.status, 0, `${argv[0]} --confirm must not succeed — confirmation is a main-context decision`);
    }

    const cliFiles = [
      '.claude/skills/workspace/cli.mjs',
      '.claude/skills/workspace/queries.mjs',
      '.claude/skills/document/cli.mjs',
      '.claude/skills/commit/cli.mjs',
    ];
    const wired = [];
    for (const rel of cliFiles) {
      let text;
      try { text = readFileSync(join(REPO_ROOT, rel), 'utf8'); } catch { continue; }
      assert.ok(text.length > 0, `${rel} must be non-empty before absence can be asserted`);
      for (const forbidden of ['runSync', 'proposeLoadBearing']) {
        if (text.includes(forbidden)) wired.push(`${rel} → ${forbidden}`);
      }
    }
    assert.deepEqual(wired, [], 'no CLI file may reference a confirm-half function; W-4 is an absence, and only a scan can assert an absence');
  });
});

describe('W-5 — the sink guards, not the caller', () => {
  // AC-011 — closes backlog listworkspacefiles-lacks-traversal-guard-3529.
  //
  // The entry deferred this at LOW on the ground that the only caller passed a
  // regex-constrained capture that cannot express `..`. This spec puts argv into
  // the same module family, so the deferral rationale expires. Guarding at the
  // sink is what makes it hold for every future caller too.
  it('test_when_list_workspace_files_given_traversal_kind_then_throws_before_readdir', async () => {
    const store = await tryImport('.claude/skills/workspace/store.mjs');
    assert.ok(store && typeof store.listWorkspaceFiles === 'function', 'store.mjs must export listWorkspaceFiles');

    const { specDir } = makeCliProject({}, mkdtemp);
    mkdirSync(join(specDir, 'diagrams'), { recursive: true });
    writeFileSync(join(specDir, 'diagrams', 'a.puml'), '@startuml\n@enduml\n', 'utf8');

    for (const kind of ['../../etc', 'a/../../b', '/etc']) {
      assert.throws(
        () => store.listWorkspaceFiles(specDir, kind, '.puml'),
        /traversal|REJECT/i,
        `listWorkspaceFiles must reject ${JSON.stringify(kind)} at the sink, matching writeWorkspaceFile two functions below it`,
      );
    }

    assert.deepEqual(
      store.listWorkspaceFiles(specDir, 'diagrams', '.puml'),
      ['a.puml'],
      'the guard must not change behavior for a legitimate literal kind',
    );
  });
});

// The `restore-shards` front door. The repair shipped as a module-only export and
// the spec's Contracts table pinned a CLI that did not exist — caught at /integrate.
// It lands here rather than as a standalone `node restore-shards.mjs` because
// cli.mjs already states the rule: the writers "sit beside the reads because they
// answer about the same corpus". A repair answers about the same corpus.
//
// Fixtures are real temp git repos. The repair walks history, so a corpus without
// one exercises only the record-fallback half.
describe('restore-shards — the repair has a front door', () => {
  function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
  }

  function shard(section, args) {
    return ['!startsub ' + section, "' @kind c4_component", `Component(${section}, ${args})`, '!endsub', ''].join('\n');
  }

  // One commit holding a degraded shard, so history offers nothing rich and the
  // record path decides the outcome — which is what lets a single fixture cover
  // both the repaired case and the unrestorable one by adding or omitting a record.
  function damagedRepo({ withRecord }) {
    const { root, specDir } = makeCliProject({}, mkdtemp);
    mkdirSync(join(specDir, 'diagrams'), { recursive: true });
    writeFileSync(join(specDir, 'diagrams', 'alpha.puml'), shard('alpha', '"alpha", "c4_component"'), 'utf8');
    if (withRecord) writeWorkspaceElement(specDir, 'alpha', { anchor: 'src/alpha/*.mjs', title: 'Alpha subsystem' });
    git(root, 'init', '-q');
    git(root, 'add', 'docs');
    git(root, '-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-q', '-m', 'seed');
    return { root, specDir };
  }

  it('test_when_restore_shards_runs_then_it_repairs_and_names_every_file_it_touched', () => {
    const { root, specDir } = damagedRepo({ withRecord: true });

    const res = runCli('workspace', ['restore-shards', '--root', root, '--spec-dir', specDir], { cwd: root });
    assertKnownSubcommand(assert, res, 'restore-shards');

    assert.equal(res.status, 0, `a corpus with nothing unrestorable exits 0; got ${res.status}\n${res.out}`);
    assert.match(res.out, /alpha/, 'the report names each file — a bare count cannot be audited against history');
    assert.match(
      readFileSync(join(specDir, 'diagrams', 'alpha.puml'), 'utf8'),
      /"src\/alpha\/\*\.mjs".*"Alpha subsystem"/,
      'the shard is rebuilt from its element record when history holds no rich blob',
    );
  });

  it('test_when_a_shard_is_unrestorable_then_the_exit_status_is_non_zero', () => {
    const { root, specDir } = damagedRepo({ withRecord: false });
    const before = readFileSync(join(specDir, 'diagrams', 'alpha.puml'), 'utf8');

    const res = runCli('workspace', ['restore-shards', '--root', root, '--spec-dir', specDir], { cwd: root });
    assertKnownSubcommand(assert, res, 'restore-shards');

    assert.notEqual(res.status, 0, 'the exit status IS the verdict here — damage nobody can repair must not read as success');
    assert.equal(readFileSync(join(specDir, 'diagrams', 'alpha.puml'), 'utf8'), before, 'an unrestorable shard is reported, never guessed at');
  });

  it('test_when_dry_run_is_passed_then_the_plan_is_printed_and_nothing_is_written', () => {
    const { root, specDir } = damagedRepo({ withRecord: true });
    const before = snapshotDir(specDir);

    const res = runCli('workspace', ['restore-shards', '--dry-run', '--root', root, '--spec-dir', specDir], { cwd: root });
    assertKnownSubcommand(assert, res, 'restore-shards');

    assert.equal(res.status, 0, `a dry run of a repairable corpus exits 0; got ${res.status}\n${res.out}`);
    assert.match(res.out, /alpha/, 'a dry run still names what it would touch, or it is not a plan');
    assert.deepEqual(snapshotDir(specDir), before, 'a dry run writes nothing — that is the whole contract');
  });
});
