// Dispatcher sweep — the seven workspace subcommands added by this spec
// (AC-001..AC-006).
//
// Split from cli-workspace.test.mjs deliberately. That file covers the nine
// read-only subcommands that shipped in 4cc46e0 and runs them against the LIVE
// docs/system/ corpus, which is safe precisely because none of them writes. Three
// of the seven here DO write, so they need their own root, and mixing the two
// policies in one file is how a live-corpus mutation eventually ships.
//
// The RED shape: none of these subcommands exists yet, so the dispatcher exits 1
// with "unknown subcommand". An assertion of `status === 0` fails legibly against
// that, naming the subcommand in the message. No import error, no opaque stack.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';
import { writeWorkspaceElement, writeWorkspaceConcept, writeWorkspaceShard } from './helpers/workspace-fixtures.mjs';
import { runCli, runCliJson, assertPresent, makeCliProject, snapshotDir } from './helpers/cli-runner.mjs';

const mkdtemp = () => mkdtempSync(join(tmpdir(), 'sweep-'));

// Three elements, so "only that element was re-stamped" has something to contrast
// against. One element re-stamped out of one would pass for an implementation that
// re-stamps everything.
//
// The anchors are FILES that actually exist in the temp root, not globs. A glob
// anchor names a family rather than a file, so `digestable()` classifies it
// not-applicable and stampElement writes nothing — correctly. A first draft used
// glob anchors here and read the resulting no-op as an implementation failure.
function seedThree(root, specDir) {
  const ids = ['alpha', 'beta', 'gamma'];
  for (const id of ids) {
    const rel = `.claude/skills/${id}/index.mjs`;
    mkdirSync(join(root, '.claude', 'skills', id), { recursive: true });
    writeFileSync(join(root, rel), `export function ${id}() { return '${id}'; }\n`, 'utf8');
    writeWorkspaceElement(specDir, id, { anchor: rel, anchor_digest: 'stale000' });
  }
  return ids;
}

describe('workspace dispatcher — the added subcommands are reachable', () => {
  // AC-001
  //
  // Asserted by NAME, not by count. A count assertion ("16 subcommands") passes
  // for a help text listing sixteen wrong names, and it also has to be edited
  // every time one is added, which makes it the first thing someone relaxes.
  it('test_when_workspace_help_runs_then_all_sixteen_subcommands_listed', () => {
    const res = runCli('workspace', ['--help']);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `--help must exit 0; got ${res.status}`);

    const shipped = ['describe', 'blast-radius', 'concept', 'coverage', 'stale', 'constraints-for', 'view', 'graph', 'flags'];
    const added = ['delta', 'digest', 'shards', 'placement', 'reconcile', 'annotations', 'sync'];
    const missing = [...shipped, ...added].filter((name) => !new RegExp(`^\\s+${name}\\s{2,}\\S`, 'm').test(res.stdout));
    assert.deepEqual(
      missing,
      [],
      'every subcommand must appear in --help with a summary beside it; a name with no summary is an undocumented command',
    );
  });
});

describe('workspace dispatcher — write subcommands', () => {
  // AC-003
  it('test_when_digest_given_one_element_then_only_that_element_restamped', () => {
    const { root, specDir } = makeCliProject({}, mkdtemp);
    seedThree(root, specDir);
    const before = snapshotDir(join(specDir, 'elements'));

    const res = runCli('workspace', ['digest', 'beta', '--root', root, '--spec-dir', specDir], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 0, `digest beta must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);

    const after = snapshotDir(join(specDir, 'elements'));
    assert.notEqual(after['beta.md'], before['beta.md'], 'the named element must be re-stamped');
    assert.equal(after['alpha.md'], before['alpha.md'], 'a sibling element must not be touched — W-3, one invocation writes one thing');
    assert.equal(after['gamma.md'], before['gamma.md'], 'a sibling element must not be touched — W-3, one invocation writes one thing');
    assert.match(res.stdout, /beta/, 'the reported path must name the element that was stamped');
  });

  // AC-004
  it('test_when_shards_given_kind_then_one_puml_written_for_that_element', () => {
    const { root, specDir } = makeCliProject({}, mkdtemp);
    writeWorkspaceElement(specDir, 'alpha', { anchor: '.claude/skills/alpha/*.mjs' });

    const res = runCli('workspace', ['shards', 'alpha', '--kind', 'sequence', '--root', root, '--spec-dir', specDir], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 0, `shards must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);

    const shard = join(specDir, 'diagrams', 'alpha.puml');
    assert.ok(existsSync(shard), 'shards must write the .puml named for the element');
    assert.match(readFileSync(shard, 'utf8'), /sequence/, 'the written shard must declare the kind that was requested');
  });

  // AC-004 — input boundary
  //
  // An UNREGISTERED kind is accepted and written unwitnessed. This test asserted
  // rejection in its first draft, which contradicted a standing decision recorded
  // at workspace/witness.mjs:30 — "an unregistered kind binds `none` rather than
  // throwing: a project may draw anything, and refusing an unknown kind would make
  // the registry a whitelist again, the exact shape this decision replaced."
  // Baseline installs into other people's repositories; a project modelling a
  // business process must be able to draw it. The spec's Contracts row was
  // corrected to match rather than the module.
  //
  // What IS refused is a MISSING kind, and for the opposite reason: requireKind in
  // shards.mjs refuses it so a shard cannot silently demote its element to
  // unwitnessed without anyone choosing that.
  it('test_when_shards_given_unregistered_kind_then_written_unwitnessed_not_rejected', async () => {
    const { root, specDir } = makeCliProject({}, mkdtemp);
    writeWorkspaceElement(specDir, 'alpha', { anchor: '.claude/skills/alpha/*.mjs' });

    const res = runCli('workspace', ['shards', 'alpha', '--kind', 'bpmn', '--root', root, '--spec-dir', specDir], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 0, `an unregistered kind is permitted; got ${res.status}: ${res.out.slice(0, 300)}`);
    assert.ok(existsSync(join(specDir, 'diagrams', 'alpha.puml')), 'the shard must be written');

    const witness = await tryImport('.claude/skills/workspace/witness.mjs');
    assert.ok(witness && typeof witness.bindingFor === 'function', 'witness.mjs must export bindingFor');
    const binding = witness.bindingFor('bpmn', { rootDir: root });
    assert.equal(binding.witness, 'none', 'an unregistered kind must bind `none` — permitted, but never citable as evidence');
    assert.equal(witness.isCitable(binding.witness), false, 'and therefore must not be citable');
  });

  // AC-004 — the refusal that IS correct
  it('test_when_shards_given_no_kind_then_rejected_and_nothing_written', () => {
    const { root, specDir } = makeCliProject({}, mkdtemp);
    writeWorkspaceElement(specDir, 'alpha', { anchor: '.claude/skills/alpha/*.mjs' });
    const before = snapshotDir(specDir);

    const res = runCli('workspace', ['shards', 'alpha', '--root', root, '--spec-dir', specDir], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 1, 'a missing --kind is a usage error: an unwitnessable shard must never be written by default');
    assert.deepEqual(snapshotDir(specDir), before, 'a rejected write must leave the corpus byte-identical');
  });

  // AC-002
  //
  // The delta path is the only writer whose input is a SPEC rather than an id, so
  // the fixture has to carry a spec with a resolvable row. verifyAndApplyDelta
  // verifies before it applies; a test that only asserted exit 0 would pass for an
  // implementation that skipped the verify half.
  it('test_when_delta_given_slug_with_confirmed_row_then_row_applied_and_reported', () => {
    // governed_surface is required, not optional: verifyDelta refuses an `add` row
    // whose anchor falls outside the declared surface, and there is deliberately no
    // default surface. A fixture omitting it fails with "governed_surface is not
    // declared", which is the corpus refusing correctly, not the CLI failing.
    const { root, specDir } = makeCliProject({
      extraConfig: {
        governed_surface: { roots: ['.claude/skills/'], codeExtensions: ['.mjs'], alwaysIncluded: [], excludedSegments: [], excludedTrees: [] },
      },
    }, mkdtemp);
    writeWorkspaceConcept(specDir, 'alpha-concept', { title: 'Alpha' });
    mkdirSync(join(root, 'docs', 'specs'), { recursive: true });
    mkdirSync(join(root, '.claude', 'skills', 'newthing'), { recursive: true });
    writeFileSync(join(root, '.claude', 'skills', 'newthing', 'thing.mjs'), 'export const x = 1;\n', 'utf8');
    writeFileSync(
      join(root, 'docs', 'specs', 'demo.md'),
      [
        '# Demo',
        '',
        '## System delta',
        '',
        '| Verb | Element | Anchor | Concept | Kind |',
        '|---|---|---|---|---|',
        '| add | new-thing | `.claude/skills/newthing/thing.mjs` | alpha-concept | c4_component |',
        '',
      ].join('\n'),
      'utf8',
    );

    // --touched is what makes the row VERIFIABLE. verifyDelta confirms a row only
    // when its anchor appears in the touched set, because the claim being checked is
    // "the spec declared this and the diff actually produced it". Omitting it is not
    // a smaller version of the same test — it exercises the inputEmpty branch, which
    // is a different contract (and the one a real /archive no-op once hid behind).
    const res = runCli('workspace', [
      'delta', '--slug', 'demo', '--touched', '.claude/skills/newthing/thing.mjs', '--root', root, '--spec-dir', specDir,
    ], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 0, `delta must exit 0 on a verifiable row; got ${res.status}: ${res.out.slice(0, 400)}`);
    assert.ok(
      existsSync(join(specDir, 'elements', 'new-thing.md')),
      'a confirmed add row must materialize the element it declares',
    );
    assert.match(res.stdout, /new-thing/, 'delta must report what it wrote, not merely exit 0');
  });
});

describe('workspace dispatcher — read subcommands added by the sweep', () => {
  // AC-005
  it('test_when_placement_given_key_then_predicate_printed_and_nothing_written', async () => {
    const { root } = makeCliProject({}, mkdtemp);
    const memDir = join(root, '.claude', 'memory');
    mkdirSync(join(memDir, 'landmarks'), { recursive: true });
    writeFileSync(
      join(memDir, 'landmarks', 'thing.md'),
      '---\nkey: thing\ncategory: landmarks\nload_bearing: true\n---\n\nbody\n',
      'utf8',
    );
    const before = snapshotDir(memDir);

    const res = runCli('workspace', ['placement', 'thing', '--mem-dir', memDir, '--root', root], { cwd: root });
    assertPresent(assert, res);
    assert.equal(res.status, 0, `placement must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);
    assert.match(res.stdout, /true/, 'a load-bearing entry must report the predicate as true');
    assert.deepEqual(snapshotDir(memDir), before, 'placement is a predicate read — it must write nothing');
  });

  // AC-006
  //
  // Deep-compared against the Domain function rather than against a literal. A
  // literal expectation here would encode today's corpus shape into the
  // Orchestration test and fail for reasons that have nothing to do with the CLI.
  it('test_when_reconcile_annotations_sync_run_then_each_equals_its_domain_return', async () => {
    const cases = [
      { sub: 'reconcile', module: '.claude/skills/workspace/reconcile.mjs', fn: 'reconcile' },
      { sub: 'annotations', module: '.claude/skills/workspace/annotations.mjs', fn: 'scanAnnotations' },
      { sub: 'sync', module: '.claude/skills/workspace/sync.mjs', fn: 'proposeMap' },
    ];
    for (const { sub, module, fn } of cases) {
      const mod = await tryImport(module);
      assert.ok(mod && typeof mod[fn] === 'function', `${module} must export ${fn} for the cross-check`);

      const res = runCliJson('workspace', [sub, '--json', '--spec-dir', join(REPO_ROOT, 'docs/system')]);
      assertPresent(assert, res);
      assert.equal(res.status, 0, `${sub} --json must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);
      assert.ok(res.json !== null, `${sub} --json must emit parseable JSON; got: ${res.stdout.slice(0, 200)}`);

      const direct = fn === 'reconcile'
        ? mod[fn]({ specDir: join(REPO_ROOT, 'docs/system') })
        : mod[fn]({ rootDir: REPO_ROOT });
      assert.deepEqual(
        res.json,
        JSON.parse(JSON.stringify(direct)),
        `${sub} must return exactly what ${fn} returns — the subcommand is a front door, not a second implementation`,
      );
    }
  });

  // AC-006 — ordering
  it('test_when_reconcile_run_twice_on_unchanged_tree_then_output_byte_identical', () => {
    const args = ['reconcile', '--json', '--spec-dir', join(REPO_ROOT, 'docs/system')];
    const first = runCli('workspace', args);
    assertPresent(assert, first);
    assert.equal(first.status, 0, `reconcile must exit 0; got ${first.status}: ${first.out.slice(0, 300)}`);
    const second = runCli('workspace', args);
    assert.equal(second.stdout, first.stdout, 'two reads of an unchanged tree must be byte-identical');
  });
});

describe('the library surface survives the sweep', () => {
  // AC-001 — regression trap
  it('test_when_existing_exports_still_importable_then_library_surface_unchanged', async () => {
    const expected = {
      '.claude/skills/workspace/store.mjs': ['listWorkspaceFiles', 'writeWorkspaceFile', 'writeElement', 'readRecords', 'assertNoTraversal'],
      '.claude/skills/workspace/digest.mjs': ['stampElement', 'stampAll'],
      '.claude/skills/workspace/shards.mjs': ['writeDiagramShard', 'readShard', 'findUnillustrated'],
      '.claude/skills/workspace/sync.mjs': ['proposeMap', 'runSync'],
      '.claude/skills/workspace/delta.mjs': ['parseDelta', 'verifyDelta', 'applyDelta', 'verifyAndApplyDelta'],
      '.claude/skills/workspace/placement.mjs': ['annotationPlacementAllowed', 'proposeLoadBearing'],
      '.claude/skills/document/receipts.mjs': ['recordReceipt', 'readReceipts', 'receiptPath'],
      '.claude/skills/document/public-site-reflect.mjs': ['findDescribedSurfaces'],
    };
    const missing = [];
    for (const [rel, names] of Object.entries(expected)) {
      const mod = await tryImport(rel);
      if (!mod) { missing.push(`${rel} (unimportable)`); continue; }
      for (const name of names) if (typeof mod[name] !== 'function') missing.push(`${rel} → ${name}`);
    }
    assert.deepEqual(
      missing,
      [],
      'adding a front door must not remove or rename any library export — SOPs and hooks import these directly',
    );
  });
});
