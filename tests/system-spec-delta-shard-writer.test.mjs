// system-spec-delta slice B — the diagram shard WRITER and the /system-reconcile
// report.
//
// Covers AC-007 (writeDiagramShard writes an annotated shard and rejects a hostile
// id before constructing a path), AC-008 (the report covers seven checks and leaves
// docs/system/ byte-identical) and AC-013 (both are inert while the
// architecture-map flag is off).
//
// Slice B builds the WRITER and the REPORT only. verifyDelta / applyDelta /
// verifyAndApplyDelta and every /archive Step 5 behavior are slice C; the 112-shard
// kind backfill is slice D; structural retrieval is slice E; the constitutional
// amendment is slice F. This file edits none of those surfaces.
//
// Two levels deliberately, matching system-spec-delta-declaration.test.mjs:
//   - the two modules are exercised directly over tmpdir corpora, so the default
//     suite covers the logic without spawning anything;
//   - the governance count is asserted as a text claim over the six mirror
//     surfaces, because a missed mirror is the failure this slice invites and it
//     should fail here rather than in audit-baseline at integrate.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { makeProject, tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, writeWorkspaceElement, writeWorkspaceShard } from './helpers/workspace-fixtures.mjs';

const SHARDS = '.claude/skills/workspace/shards.mjs';
const REPORT = '.claude/skills/system-reconcile/reconcile-report.mjs';
const DERIVER = '.claude/skills/audit-baseline/derive-counts.mjs';
const RECONCILE_SKILL = join(REPO_ROOT, '.claude/skills/system-reconcile/SKILL.md');
const REPORT_SOURCE = join(REPO_ROOT, REPORT);

const SEVEN_CHECKS = [
  'gaps', 'stale', 'dangling', 'duplicateAnchors', 'orphanShards', 'unillustrated', 'missingKind',
];

// ─── Foundation: temp projects and corpus snapshots ───

// A surface narrow enough that the fixture owns every governed file. Reusing the
// live repo's roots would make `gaps` depend on whatever else is on disk.
const GOVERNED_SURFACE = {
  roots: ['src/'],
  codeExtensions: ['.mjs'],
  alwaysIncluded: [],
  excludedSegments: ['tests/'],
  excludedTrees: [],
};

const WITNESSES = {
  c4_component: { witness: 'anchor-digest' },
  sequence: { witness: 'test' },
};

function writeProjectConfig(root, config) {
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'project.json'), JSON.stringify(config), 'utf8');
}

// `state` is 'on' | 'off' | 'absent' — AC-013 names both the explicit `false` and
// the missing key, so the fixture has to be able to produce each.
function makeFlaggedProject(state) {
  const project = makeProject();
  const architectureMap = { governed_surface: GOVERNED_SURFACE, witnesses: WITNESSES };
  if (state === 'on') architectureMap.enabled = true;
  if (state === 'off') architectureMap.enabled = false;
  writeProjectConfig(project.root, { memory: { architecture_map: architectureMap } });
  return project;
}

function writeGovernedFile(root, rel) {
  const path = join(root, rel);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(path, 'export const marker = 1;\n', 'utf8');
  return path;
}

// A recursive content hash of the corpus. `snapshotTree` in memory-fixtures walks
// the CANONICAL categories, which the corpus deliberately is not, so it cannot
// answer "did docs/system/ change".
function hashTree(dir) {
  const hash = createHash('sha256');
  const walk = (rel) => {
    let entries;
    try {
      entries = readdirSync(join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else hash.update(`${child} ${readFileSync(join(dir, child), 'utf8')} `);
    }
  };
  walk('');
  return hash.digest('hex');
}

function listDiagrams(specDir) {
  try {
    return readdirSync(join(specDir, 'diagrams')).sort();
  } catch {
    return [];
  }
}

function dirExists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// One corpus carrying exactly one instance of each of the seven conditions, so an
// assertion on any array names a seeded item rather than an accident of the tree.
function seedSevenConditions({ root, specDir }) {
  makeWorkspace(specDir);
  for (const rel of ['src/alpha.mjs', 'src/beta.mjs', 'src/gamma.mjs', 'src/stale.mjs', 'src/shared.mjs']) {
    writeGovernedFile(root, rel);
  }
  writeGovernedFile(root, 'src/unclaimed.mjs');

  writeWorkspaceElement(specDir, 'alpha', { anchor: 'src/alpha.mjs' });
  writeWorkspaceShard(specDir, 'alpha', { lines: ["' @kind c4_component", 'Component(alpha, "alpha", "Node ESM", "seeded")'] });

  writeWorkspaceElement(specDir, 'beta', { anchor: 'src/beta.mjs' });
  writeWorkspaceShard(specDir, 'beta');

  writeWorkspaceElement(specDir, 'gamma', { anchor: 'src/gamma.mjs' });

  writeWorkspaceElement(specDir, 'nowhere-el', { anchor: 'src/nowhere.mjs' });

  writeWorkspaceElement(specDir, 'stale-el', { anchor: 'src/stale.mjs', anchor_digest: '000000000000' });

  writeWorkspaceElement(specDir, 'dup-a', { anchor: 'src/shared.mjs' });
  writeWorkspaceElement(specDir, 'dup-b', { anchor: 'src/shared.mjs' });

  writeWorkspaceShard(specDir, 'ghost');
}

async function loadWriter() {
  const shards = await tryImport(SHARDS);
  assert.ok(shards?.writeDiagramShard, `${SHARDS} does not export writeDiagramShard yet`);
  return shards;
}

async function loadReport() {
  const report = await tryImport(REPORT);
  assert.ok(report?.runReconcile, `${REPORT} does not exist yet`);
  return report;
}

// ─── AC-007 — the writer ───

describe('AC-007 — writeDiagramShard writes an annotated shard', () => {
  it('test_when_write_diagram_shard_on_fresh_id_then_annotated_shard_round_trips', async () => {
    const shards = await loadWriter();
    const { root, specDir } = makeFlaggedProject('on');
    makeWorkspace(specDir);

    const result = shards.writeDiagramShard(specDir, 'foo-guard', {
      kind: 'c4_component',
      witnessTest: 'tests/foo.test.mjs',
      label: 'Foo Guard',
      rootDir: root,
    });

    assert.deepEqual(result, { path: 'diagrams/foo-guard.puml', written: true });

    const shard = shards.readShard(specDir, 'foo-guard');
    assert.ok(shard, 'the written shard must be readable by the reader that consumes it');
    // PlantUML rejects a hyphen in a `!startsub` name ("Bad sub name"), so the
    // section is the id with hyphens swapped for underscores — the map
    // `elementIdFromSection` inverts, and all 112 live shards are written this way.
    assert.equal(shard.section, 'foo_guard', 'the section name IS the join key to the element record');
    assert.equal(shards.elementIdFromSection(shard.section), 'foo-guard', 'the join must round-trip both ways');
    assert.equal(shard.kind, 'c4_component');
    assert.equal(shard.witnessTest, 'tests/foo.test.mjs');

    // D3 — `!includesub file!NAME` pulls in only the block's CONTENT, so an
    // annotation outside the block does not survive extraction. Asserted by line
    // index rather than substring presence, which would pass on a shard whose
    // annotation sat above `!startsub`.
    const lines = readFileSync(join(specDir, 'diagrams/foo-guard.puml'), 'utf8').split('\n');
    const startAt = lines.findIndex((line) => line.startsWith('!startsub'));
    const endAt = lines.findIndex((line) => line.startsWith('!endsub'));
    const kindAt = lines.findIndex((line) => /^'\s*@kind\s/.test(line));
    const witnessAt = lines.findIndex((line) => /^'\s*@witness\s/.test(line));

    assert.ok(startAt >= 0 && endAt > startAt, 'the shard must be a complete !startsub/!endsub block');
    assert.ok(kindAt > startAt && kindAt < endAt, 'the kind annotation must sit INSIDE the block (D3)');
    assert.ok(witnessAt > startAt && witnessAt < endAt, 'the witness annotation must sit INSIDE the block (D3)');
  });

  it('test_when_write_diagram_shard_hostile_id_then_throws_before_any_path', async () => {
    const shards = await loadWriter();
    const { root, specDir } = makeFlaggedProject('on');
    makeWorkspace(specDir);
    shards.writeDiagramShard(specDir, 'valid-one', { kind: 'c4_component', rootDir: root });
    const before = listDiagrams(specDir);

    for (const hostile of ['..', 'a/b', 'A_B', 'x'.repeat(5000)]) {
      assert.throws(
        () => shards.writeDiagramShard(specDir, hostile, { kind: 'c4_component', rootDir: root }),
        /unsafe slug|over-long slug/,
        `id ${JSON.stringify(hostile.slice(0, 12))} must be REJECTED by the slug guard, never repaired`,
      );
    }

    assert.deepEqual(
      listDiagrams(specDir),
      before,
      'no path may be constructed for a rejected id — the directory listing must be untouched',
    );
  });

  it('test_when_write_diagram_shard_rerun_with_same_input_then_bytes_identical', async () => {
    const shards = await loadWriter();
    const { root, specDir } = makeFlaggedProject('on');
    makeWorkspace(specDir);
    const options = { kind: 'sequence', witnessTest: 'tests/x.test.mjs', label: 'X', rootDir: root };

    const first = shards.writeDiagramShard(specDir, 'idem-el', options);
    const firstBytes = readFileSync(join(specDir, first.path), 'utf8');
    const second = shards.writeDiagramShard(specDir, 'idem-el', options);
    const secondBytes = readFileSync(join(specDir, second.path), 'utf8');

    assert.equal(secondBytes, firstBytes, 'same input must rewrite identical bytes — slice D re-runs this 112 times');
    // This used to be `deepEqual(second, first)`, which pinned `written: true` on
    // the re-run. AC-003 of diagram-shard-rewrite-loses-fields supersedes it: a
    // rewrite whose merged bytes equal what is already on disk writes NOTHING and
    // reports `written: false`. That is a stronger guarantee than rewriting
    // identical bytes, and the "112 times" above is exactly the case it optimizes.
    assert.equal(second.path, first.path, 'the same element still resolves to the same shard path');
    assert.equal(second.written, false, 'the second call must be a no-op, not an identical rewrite');
  });

  it('test_when_write_diagram_shard_label_or_witness_carries_newline_then_rejected', async () => {
    const shards = await loadWriter();
    const { root, specDir } = makeFlaggedProject('on');
    makeWorkspace(specDir);

    // Same class as the 2026-08-05 MEDIUM in render.composeView: an unvalidated
    // newline forges an arbitrary PlantUML directive into the generated document.
    const forged = [
      { label: 'Legit\n!include /etc/passwd', witnessTest: 'tests/x.test.mjs' },
      { label: 'Legit', witnessTest: 'tests/x.test.mjs\ntitle Injected' },
      { label: 'Legit', witnessTest: 'tests/x.test.mjs', kind: 'c4_component\n!endsub' },
    ];
    for (const overrides of forged) {
      assert.throws(
        () => shards.writeDiagramShard(specDir, 'forge-el', { kind: 'c4_component', rootDir: root, ...overrides }),
        /unsafe field/,
        `${JSON.stringify(overrides)} must be REJECTED before interpolation`,
      );
    }

    assert.deepEqual(listDiagrams(specDir), [], 'a rejected value must leave no partial shard behind');
  });

  // Phase-8 MEDIUM, docs/security/system-spec-delta-slice-b-2026-08-07.md. The
  // newline guard let a double quote through, and a quote closes the C4 macro's
  // argument early: `label` of `ok", "X` turned Component/3 into Component/5 with
  // an attacker-chosen technology and description. Same class as the newline
  // forgery one line up, different delimiter.
  it('test_when_label_or_kind_carries_a_quote_then_rejected', async () => {
    const shards = await loadWriter();
    const { root, specDir } = makeFlaggedProject('on');
    makeWorkspace(specDir);

    for (const overrides of [
      { label: 'ok", "FORGED_TECH", "FORGED_DESC' },
      { kind: 'c4_component", "forged' },
    ]) {
      assert.throws(
        () => shards.writeDiagramShard(specDir, 'quote-el', { kind: 'c4_component', rootDir: root, ...overrides }),
        /unsafe field/,
        `${JSON.stringify(overrides)} must be REJECTED — a quote escapes the C4 argument`,
      );
    }

    assert.deepEqual(listDiagrams(specDir), [], 'a rejected value must leave no partial shard behind');
  });

  // Phase-8 LOW. The read-side sibling (tree.readSourceText) opens with
  // assertNoTraversal; the new write primitive did not. No caller passes a
  // computed `kind` today — this pins the guard before the second one arrives.
  it('test_when_write_workspace_file_gets_a_traversal_then_rejected', async () => {
    const store = await tryImport('.claude/skills/workspace/store.mjs');
    assert.ok(store?.writeWorkspaceFile, 'store.mjs does not export writeWorkspaceFile yet');
    const { specDir } = makeFlaggedProject('on');

    for (const [kind, name] of [['../../escaped', 'x.puml'], ['diagrams', '../../escaped.puml']]) {
      assert.throws(
        () => store.writeWorkspaceFile(specDir, kind, name, 'body'),
        /unsafe path traversal/,
        `writeWorkspaceFile(${JSON.stringify(kind)}, ${JSON.stringify(name)}) must REJECT, never normalize`,
      );
    }
  });
});

// ─── AC-008 — the report ───

describe('AC-008 — /system-reconcile reports seven checks and writes nothing', () => {
  it('test_when_reconcile_runs_over_seeded_corpus_then_seven_checks_reported', async () => {
    const report = await loadReport();
    const project = makeFlaggedProject('on');
    seedSevenConditions(project);

    const result = report.runReconcile({ specDir: project.specDir, rootDir: project.root });

    assert.deepEqual(
      Object.keys(result).sort(),
      [...SEVEN_CHECKS].sort(),
      'the report must carry exactly the seven checks AC-008 enumerates',
    );

    const flat = (rows) => rows.map((row) => JSON.stringify(row)).join(' ');
    assert.match(flat(result.gaps), /src\/unclaimed\.mjs/, 'a governed file no anchor matches is a gap');
    assert.match(flat(result.stale), /stale-el/, 'an element whose stored digest moved is stale');
    assert.match(flat(result.dangling), /nowhere-el/, 'an anchor resolving to nothing is dangling');
    assert.match(flat(result.duplicateAnchors), /dup-a/, 'two ids claiming one anchor is a duplicate anchor');
    assert.match(flat(result.duplicateAnchors), /dup-b/);
    assert.match(flat(result.orphanShards), /ghost/, 'a section naming no element is an orphan shard');
    assert.match(flat(result.unillustrated), /gamma/, 'an element with no shard is unillustrated');
    assert.match(flat(result.missingKind), /beta/, 'a shard with no @kind annotation is uncitable');

    assert.ok(
      !flat(result.missingKind).includes('gamma'),
      'an element with no shard at all belongs to unillustrated only — counting it twice inflates both arrays',
    );
  });

  it('test_when_reconcile_runs_then_corpus_bytes_identical', async () => {
    const report = await loadReport();
    const project = makeFlaggedProject('on');
    seedSevenConditions(project);

    const before = hashTree(project.specDir);
    report.runReconcile({ specDir: project.specDir, rootDir: project.root });

    assert.equal(
      hashTree(project.specDir),
      before,
      'rollout prerequisite 5 — the report path leaves docs/system/ byte-identical',
    );
  });

  it('test_when_reconcile_report_module_inspected_then_it_exports_no_writer', async () => {
    const report = await loadReport();

    // Amended 2026-08-25 (release-safety, T8). The module gained two read-only
    // exports so /archive Step 5.5 could gate on corpus health: reconcileForGate
    // returns the report plus a produced flag (seven empty arrays mean "clean",
    // "flag off" and "crashed" alike, so emptiness alone is not health), and
    // gatingFailures projects it to the six sections that block. Neither writes.
    // What D9 forbids is an apply path, and that is what is asserted here.
    assert.deepEqual(
      Object.keys(report).sort(),
      ['gatingFailures', 'reconcileForGate', 'runReconcile'],
      'D9 — the module exposes no apply path a workflow phase could reach',
    );

    // Enforced by construction, not by a mode flag: a writer that does not exist
    // cannot be wired into a phase, which is what preserves the corpus's
    // one-writer rule (corpus-has-one-writer-archive-on-the-primary-tree).
    const source = readFileSync(REPORT_SOURCE, 'utf8');
    for (const writer of [
      'writeFileSync', 'mkdirSync', 'rmSync', 'appendFileSync', 'writeElement', 'writeRecord',
      'removeElement', 'writeDiagramShard',
    ]) {
      assert.ok(!source.includes(writer), `reconcile-report.mjs must not reference the writer ${writer}`);
    }

    assert.match(
      readFileSync(RECONCILE_SKILL, 'utf8'),
      /^owner:\s*baseline\s*$/m,
      'the shipped skill must declare baseline ownership (Art. XII)',
    );
  });
});

// ─── AC-013 — inert while the flag is off ───

describe('AC-013 — the new modules are inert while the flag is off', () => {
  for (const state of ['off', 'absent']) {
    it(`test_when_flag_${state}_then_writer_and_reconcile_are_inert`, async () => {
      const shards = await loadWriter();
      const report = await loadReport();
      const project = makeFlaggedProject(state);
      seedSevenConditions(project);
      const before = hashTree(project.specDir);

      const written = shards.writeDiagramShard(project.specDir, 'inert-el', {
        kind: 'c4_component',
        rootDir: project.root,
      });
      assert.deepEqual(written, { path: null, written: false }, 'the writer must return an empty result, not throw');

      const result = report.runReconcile({ specDir: project.specDir, rootDir: project.root });
      assert.deepEqual(Object.keys(result).sort(), [...SEVEN_CHECKS].sort(), 'the shape must not change with the flag');
      for (const check of SEVEN_CHECKS) {
        assert.deepEqual(result[check], [], `${check} must be empty while the flag is ${state}`);
      }

      assert.equal(hashTree(project.specDir), before, 'no read may become a write; docs/system/ is untouched');
    });
  }

  it('test_when_flag_off_then_hostile_id_still_does_not_throw', async () => {
    const shards = await loadWriter();
    const project = makeFlaggedProject('off');
    makeWorkspace(project.specDir);

    // Behavior #13 promises "empty result — no throw" with no carve-out for a
    // hostile id, and neither branch constructs a path. Pinning the ORDER here
    // stops a later refactor from hoisting validation above the gate and quietly
    // making an opted-out project throw.
    assert.doesNotThrow(() => shards.writeDiagramShard(project.specDir, '..', {
      kind: 'c4_component',
      rootDir: project.root,
    }));
    assert.deepEqual(
      shards.writeDiagramShard(project.specDir, '..', { kind: 'c4_component', rootDir: project.root }),
      { path: null, written: false },
    );
    assert.deepEqual(listDiagrams(project.specDir), []);
  });

  it('test_when_corpus_unreadable_with_flag_on_then_reconcile_returns_empty_without_throwing', async () => {
    const report = await loadReport();
    const project = makeFlaggedProject('on');
    const absent = join(project.root, 'docs', 'nowhere-at-all');
    assert.equal(dirExists(absent), false, 'sanity: the fixture corpus must really be absent');

    let result;
    assert.doesNotThrow(() => {
      result = report.runReconcile({ specDir: absent, rootDir: project.root });
    }, 'an unreadable corpus yields empty arrays — it never throws at the caller');

    for (const check of SEVEN_CHECKS) {
      assert.deepEqual(result[check], [], `${check} must be empty over an unreadable corpus`);
    }
    assert.equal(dirExists(absent), false, 'the report must not conjure the corpus it failed to read');
  });
});

// ─── Governance — the count this slice moves ───

// AC-011 is this block: the derived total, the authored category sum, and every
// pinned prose surface must agree on one number. AC-012 — the manifest carrying
// that many `owners.skills` entries with no hash mismatch — is audit-baseline's
// to assert, and it runs as the first half of the binding test command.
describe('slice B governance — one new baseline-owned skill', () => {
  it('test_when_skill_shipped_then_ownership_and_counts_agree', async () => {
    const deriver = await tryImport(DERIVER);
    assert.ok(deriver, `${DERIVER} does not exist`);

    assert.equal(deriver.deriveCounts(REPO_ROOT).skills, 59, 'disk must carry 59 baseline-owned skills');
    assert.equal(
      Object.values(deriver.SKILL_CATEGORIES).reduce((a, b) => a + b, 0),
      59,
      'the authored category breakdown must sum to the derived total',
    );

    // Every surface that states the count, asserted in one place. A missed mirror
    // is the failure mode of adding a skill, and it should fail here rather than
    // in audit-baseline at integrate.
    const surfaces = [
      ['CLAUDE.md', /\b59 skills\b/],
      ['src/CLAUDE.template.md', /\b59 skills\b/],
      ['README.md', /\b59 skills\b/],
      ['docs/init/seed.md', /§4\.3 Skills \(59\)/],
      ['src/seed.template.md', /§4\.3 Skills \(59\)/],
      ['site-src/skills.njk', /\b59 baseline-owned skills\b/],
    ];
    for (const [rel, required] of surfaces) {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      assert.match(text, required, `${rel} must claim the new count`);
      assert.ok(
        !/\b58\s+(?:baseline-owned\s+)?skills?\b/.test(text),
        `${rel} still claims 58 skills somewhere`,
      );
    }

    assert.match(
      readFileSync(join(REPO_ROOT, 'site-src/skills.njk'), 'utf8'),
      /value:\s*"59"/,
      'the rendered stat tile must carry the new count',
    );
  });
});
