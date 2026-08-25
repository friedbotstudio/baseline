// system-spec-delta slice C — /archive verifies the declared delta against the
// landed diff before applying anything.
//
// Covers AC-004 (an unconfirmed row applies nothing), AC-005 (a confirmed row is
// applied end to end), AC-006 (a touched governed path no row claims is reported,
// not written), AC-009 (Step 5.5 is report-only, so the corpus is byte-identical
// across it) and AC-014 (the whole path is inert while the architecture-map flag
// is off).
//
// The load-bearing assertions here are the NEGATIVE ones. Step 5 today calls
// `syncBack`, which re-stamps and nothing else, so a landing that adds a governed
// file silently opens a coverage gap. Replacing it with verify-then-apply is only
// worth anything if an UNCONFIRMED row writes nothing — a verifier that applies
// what it cannot confirm is a rename of the bug it replaces.
//
// Slice C builds the verifier and rewrites the two archive steps. `parseDelta`
// (slice A) and `writeDiagramShard` / `runReconcile` (slice B) are CONSUMED here
// and re-tested nowhere: their suites already exist. The 112-shard kind backfill
// (slice D), structural retrieval (slice E) and the amendment (slice F) are
// untouched, as is `contribute.syncBack`, whose receipt defect stays open by D7.
//
// Two levels, matching the two slices before it:
//   - the module is exercised directly over tmpdir corpora, so the default suite
//     covers the logic without spawning anything;
//   - the archive SOP is asserted as a text claim, because a verifier nothing calls
//     is the failure this slice invites and it should fail here rather than be
//     discovered on the next landing.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { makeProject, tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, writeWorkspaceConcept, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';

const DELTA = '.claude/skills/workspace/delta.mjs';
const SHARDS = '.claude/skills/workspace/shards.mjs';
const REPORT = '.claude/skills/system-reconcile/reconcile-report.mjs';
const ARCHIVE_SKILL = join(REPO_ROOT, '.claude/skills/archive/SKILL.md');

const SLUG = 'landing-under-test';
const CONCEPT = 'guard-substrate';

// ─── Foundation: a temp project whose governed surface the fixture owns ───

// Narrow enough that every governed file is one the fixture wrote. Reusing the live
// repo's roots would make `unclaimed` depend on whatever else is on disk.
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

// `state` is 'on' | 'off' | 'absent' — AC-014 names both the explicit `false` and
// the missing key, so the fixture has to be able to produce each.
function makeFlaggedProject(state) {
  const project = makeProject();
  const architectureMap = { governed_surface: GOVERNED_SURFACE, witnesses: WITNESSES };
  if (state === 'on') architectureMap.enabled = true;
  if (state === 'off') architectureMap.enabled = false;
  mkdirSync(join(project.root, '.claude'), { recursive: true });
  writeFileSync(
    join(project.root, '.claude', 'project.json'),
    JSON.stringify({ memory: { architecture_map: architectureMap } }),
    'utf8',
  );
  return project;
}

function writeGovernedFile(root, rel) {
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, rel), `export const marker = ${JSON.stringify(rel)};\n`, 'utf8');
  return rel;
}

// The delta section as a spec author writes it. `*(none)*` is the sole legal empty
// body (D4), so an empty-delta fixture passes zero rows rather than an empty table.
function writeSpecWithDelta(root, slug, rows) {
  const dir = join(root, 'docs', 'specs');
  mkdirSync(dir, { recursive: true });
  const body = rows.length
    ? [
      '| Verb | Element | Anchor | Concept | Kind |',
      '|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.verb} | ${r.elementId} | ${r.anchor} | ${r.concept} | ${r.kind} |`),
    ]
    : ['*(none)*'];
  const text = ['# Spec — fixture', '', '## System delta', '', ...body, '', '## Acceptance criteria', ''].join('\n');
  writeFileSync(join(dir, `${slug}.md`), text, 'utf8');
  return join(dir, `${slug}.md`);
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

function readElementField(specDir, id, field) {
  let text;
  try {
    text = readFileSync(join(specDir, 'elements', `${id}.md`), 'utf8');
  } catch {
    return null;
  }
  return new RegExp(`^${field}:\\s*(.+)$`, 'm').exec(text)?.[1]?.trim() ?? null;
}

function readConceptAnchors(specDir, id) {
  const text = readFileSync(join(specDir, 'concepts', `${id}.md`), 'utf8');
  return (/^anchors:\s*(.*)$/m.exec(text)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function countElements(specDir) {
  try {
    return readdirSync(join(specDir, 'elements')).length;
  } catch {
    return 0;
  }
}

// A corpus with one already-modelled element and one concept that anchors it. Every
// authored anchor must resolve or `materialize` refuses the whole map, so the seeded
// anchor points at a file the fixture really wrote.
function seedCorpus({ root, specDir }) {
  makeWorkspace(specDir);
  writeGovernedFile(root, 'src/alpha.mjs');
  writeWorkspaceElement(specDir, 'alpha', { anchor: 'src/alpha.mjs' });
  writeWorkspaceConcept(specDir, CONCEPT, {
    title: 'Guard substrate',
    members: ['alpha'],
    anchors: 'alpha=src/alpha.mjs',
  });
}

const ADD_FOO = {
  verb: 'add',
  elementId: 'foo-guard',
  anchor: 'src/foo_guard.mjs',
  concept: CONCEPT,
  kind: 'c4_component',
};

async function loadDelta() {
  const delta = await tryImport(DELTA);
  assert.ok(delta?.verifyAndApplyDelta, `${DELTA} does not export verifyAndApplyDelta yet`);
  assert.ok(delta?.verifyDelta, `${DELTA} does not export verifyDelta yet`);
  assert.ok(delta?.applyDelta, `${DELTA} does not export applyDelta yet`);
  return delta;
}

const runStep5 = (delta, project, touchedPaths) => delta.verifyAndApplyDelta({
  slug: SLUG,
  specDir: project.specDir,
  memDir: project.memDir,
  rootDir: project.root,
  touchedPaths,
});

// ─── AC-004 — an unconfirmed row applies nothing ───

describe('AC-004 — a declared row the landed diff does not confirm is drift', () => {
  it('test_when_add_row_anchor_is_absent_from_the_landed_diff_then_nothing_is_written', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    // The anchor exists on disk, so only the DIFF distinguishes this from AC-005.
    // A verifier that checked existence alone would pass this test wrongly.
    writeGovernedFile(project.root, ADD_FOO.anchor);
    writeSpecWithDelta(project.root, SLUG, [ADD_FOO]);
    const before = hashTree(project.specDir);

    const result = runStep5(delta, project, ['src/alpha.mjs']);

    assert.deepEqual(result.confirmed, [], 'a row the diff does not confirm must not be confirmed');
    assert.equal(result.drift.length, 1, 'the unconfirmed row must be reported as drift');
    assert.match(JSON.stringify(result.drift), /foo-guard/, 'drift must name the offending row');
    assert.deepEqual(result.applied, [], 'nothing may be applied for an unconfirmed row');
    assert.deepEqual(result.shardsWritten, [], 'no shard may be written for an unconfirmed row');
    assert.equal(result.inputEmpty, false, 'paths were passed — this is a no-match, not an empty input');

    assert.equal(hashTree(project.specDir), before, 'the corpus must be byte-identical after an unconfirmed row');
    assert.equal(readElementField(project.specDir, 'foo-guard', 'anchor'), null, 'no element may be created');
    assert.deepEqual(
      readConceptAnchors(project.specDir, CONCEPT),
      ['alpha=src/alpha.mjs'],
      'no anchor may be appended to the concept',
    );
  });

  it('test_when_touched_paths_is_empty_then_input_empty_is_true_and_a_no_match_run_reports_false', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    writeGovernedFile(project.root, ADD_FOO.anchor);
    writeSpecWithDelta(project.root, SLUG, [ADD_FOO]);

    const empty = runStep5(delta, project, []);
    const noMatch = runStep5(delta, project, ['src/alpha.mjs']);

    // The return-shape rule, and the reason for it: `syncBack` returns the same
    // `{applied:[],proposed:[]}` when nothing matched and when the caller passed no
    // paths, and that ambiguity already produced one silent no-op on a real landing
    // (zsh does not word-split, so N paths arrived as one argument).
    assert.equal(empty.inputEmpty, true, 'an empty touchedPaths must be reported as such');
    assert.equal(noMatch.inputEmpty, false, 'a populated touchedPaths that matched nothing is NOT an empty input');
    assert.notDeepEqual(
      empty,
      noMatch,
      'the two situations must be distinguishable by shape — one return for both is the defect',
    );
    assert.deepEqual(empty.applied, [], 'an empty input applies nothing');
  });

  it('test_when_a_row_carries_a_traversal_element_id_or_anchor_then_verify_throws_before_any_read', async () => {
    const delta = await loadDelta();
    const absentCorpus = join(makeFlaggedProject('on').root, 'docs', 'nowhere-at-all');

    const hostile = [
      { ...ADD_FOO, elementId: '..' },
      { ...ADD_FOO, elementId: 'a/b' },
      { ...ADD_FOO, elementId: 'A_B' },
      { ...ADD_FOO, anchor: '../../etc/passwd' },
      { ...ADD_FOO, anchor: 'src/../../escaped.mjs' },
    ];

    for (const row of hostile) {
      // specDir points at nothing, so an ENOENT would prove a read ran first. The
      // guard must REJECT, never repair: normalizing a traversal writes to a
      // different path than the caller named and hides the attempt.
      assert.throws(
        () => delta.verifyDelta({
          rows: [row],
          touchedPaths: ['src/foo_guard.mjs'],
          specDir: absentCorpus,
          rootDir: join(absentCorpus, '..', '..'),
        }),
        /unsafe slug|unsafe path traversal|over-long slug/,
        `${JSON.stringify({ elementId: row.elementId, anchor: row.anchor })} must be rejected before any read`,
      );
    }
  });
});

// ─── Phase-8 findings — the public export defends itself ───
//
// docs/security/system-spec-delta-slice-c-2026-08-07.md, two MEDIUMs. `applyDelta`
// is exported and named in the spec's Contracts table, so a second caller will
// eventually reach it without going through `verifyDelta` first. Both findings were
// confirmed by execution, not inferred.

describe('phase-8 — applyDelta validates its own input rather than inheriting it', () => {
  it('test_when_apply_delta_gets_a_traversal_anchor_then_it_throws_before_writing_anything', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    const before = hashTree(project.specDir);

    // `materialize` DOES refuse a dangling anchor — but only after `declareAnchor`
    // has already committed it to the concept file. The traversal string then sits
    // in the authored `anchors:` field permanently and every later materialize
    // anywhere in the repo throws on it, which reads as a bug in the next workflow
    // rather than as a rejected attack in this one.
    assert.throws(
      () => delta.applyDelta({
        confirmed: [{ ...ADD_FOO, anchor: '../../../etc/passwd' }],
        specDir: project.specDir,
        rootDir: project.root,
      }),
      /unsafe path traversal/,
      'the guard must fire, not materialize downstream',
    );

    assert.equal(hashTree(project.specDir), before, 'a rejected row must leave NO residue in the corpus');
    assert.deepEqual(
      readConceptAnchors(project.specDir, CONCEPT),
      ['alpha=src/alpha.mjs'],
      'the traversal string must never reach the authored anchors field',
    );
  });

  it('test_when_an_anchor_carries_a_delimiter_then_it_is_rejected_not_normalized', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    writeGovernedFile(project.root, 'src/foo_guard.mjs');
    writeGovernedFile(project.root, 'src/secret.mjs');
    const before = hashTree(project.specDir);

    // `anchors:` is comma-delimited and each row splits on the first `=`, so an
    // anchor carrying either delimiter forges a SECOND declaration the delta table
    // never showed a reviewer. Measured: one row produced elements foo-guard AND
    // injected, the latter anchored at src/secret.mjs.
    for (const anchor of ['src/foo_guard.mjs,injected=src/secret.mjs', 'src/foo_guard.mjs=alias']) {
      assert.throws(
        () => delta.applyDelta({
          confirmed: [{ ...ADD_FOO, anchor }],
          specDir: project.specDir,
          rootDir: project.root,
        }),
        /unsafe anchor/,
        `${JSON.stringify(anchor)} must be REJECTED — normalizing writes an anchor the author did not name`,
      );
    }

    assert.equal(hashTree(project.specDir), before, 'no forged element may reach disk');
    assert.deepEqual(
      readdirSync(join(project.specDir, 'elements')).sort(),
      ['alpha.md'],
      'exactly the seeded element — a forged second element is the finding',
    );
  });

  it('test_when_verify_delta_gets_a_delimiter_anchor_then_it_rejects_at_the_entry_point_too', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    writeGovernedFile(project.root, 'src/foo_guard.mjs');
    writeSpecWithDelta(project.root, SLUG, [{ ...ADD_FOO, anchor: 'src/foo_guard.mjs,injected=src/alpha.mjs' }]);

    // Today `confirms()` happens to reject this row because a comma-bearing glob
    // matches no real path — the corpus is safe by accident. Pinning the explicit
    // rejection stops a future matcher change from turning that luck into a hole.
    assert.throws(
      () => runStep5(delta, project, ['src/foo_guard.mjs']),
      /unsafe anchor/,
      'the entry point must reject the delimiter outright, not rely on the matcher missing it',
    );
  });
});

// ─── AC-005 — a confirmed row is applied ───

describe('AC-005 — a confirmed add row lands anchor, digest and shard', () => {
  it('test_when_an_add_row_is_confirmed_then_the_anchor_is_appended_and_a_shard_is_written', async () => {
    const delta = await loadDelta();
    const shards = await tryImport(SHARDS);
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    writeGovernedFile(project.root, ADD_FOO.anchor);
    writeSpecWithDelta(project.root, SLUG, [ADD_FOO]);

    const result = runStep5(delta, project, ['src/foo_guard.mjs']);

    assert.match(JSON.stringify(result.confirmed), /foo-guard/, 'a row the diff confirms must be confirmed');
    assert.deepEqual(result.drift, [], 'a confirmed row is not drift');
    assert.deepEqual(result.applied, ['foo-guard'], 'the confirmed row must be applied');
    assert.equal(result.shardsWritten.length, 1, 'exactly one shard must be written');

    assert.ok(
      readConceptAnchors(project.specDir, CONCEPT).includes('foo-guard=src/foo_guard.mjs'),
      'the anchor must be appended to the concept the row names, carrying the authored id',
    );
    assert.ok(
      readConceptAnchors(project.specDir, CONCEPT).includes('alpha=src/alpha.mjs'),
      'appending must not erase the anchors already authored — the field is authored, not derived',
    );

    assert.equal(
      readElementField(project.specDir, 'foo-guard', 'anchor'),
      'src/foo_guard.mjs',
      'materialize must have expanded the appended anchor into an element record',
    );
    const digest = readElementField(project.specDir, 'foo-guard', 'anchor_digest');
    assert.ok(digest && digest.length > 0, 'stampElement must have stamped the new element');

    const shard = shards.readShard(project.specDir, 'foo-guard');
    assert.ok(shard, 'writeDiagramShard must have produced a shard the reader can consume');
    assert.equal(shard.kind, 'c4_component', "the row's Kind must round-trip into the shard annotation");
  });

  it('test_when_apply_delta_runs_twice_then_the_second_run_writes_no_new_element_or_anchor', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    writeGovernedFile(project.root, ADD_FOO.anchor);
    writeSpecWithDelta(project.root, SLUG, [ADD_FOO]);

    runStep5(delta, project, ['src/foo_guard.mjs']);
    const afterFirst = hashTree(project.specDir);
    const anchorsAfterFirst = readConceptAnchors(project.specDir, CONCEPT);
    const countAfterFirst = countElements(project.specDir);

    runStep5(delta, project, ['src/foo_guard.mjs']);

    // Idempotence is not cosmetic here: /archive re-runs on a resumed workflow, and
    // an append that duplicates makes `conflicts.duplicateAnchor` fire on a corpus
    // nobody edited.
    assert.deepEqual(readConceptAnchors(project.specDir, CONCEPT), anchorsAfterFirst, 'the anchor must not duplicate');
    assert.equal(countElements(project.specDir), countAfterFirst, 'no second element record may appear');
    assert.equal(hashTree(project.specDir), afterFirst, 're-running an applied delta must rewrite identical bytes');
  });
});

// ─── AC-006 — a touched governed path no row claims ───

describe('AC-006 — an unclaimed governed path is reported, never written', () => {
  it('test_when_a_touched_governed_path_is_claimed_by_no_row_and_no_element_then_it_is_reported_unclaimed', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    writeGovernedFile(project.root, 'src/bar_guard.mjs');
    writeSpecWithDelta(project.root, SLUG, []);
    const before = hashTree(project.specDir);

    const result = runStep5(delta, project, ['src/bar_guard.mjs']);

    assert.deepEqual(result.unclaimed, ['src/bar_guard.mjs'], 'a governed path nothing claims is the coverage gap');
    assert.deepEqual(result.applied, [], 'an unclaimed path is a report, never a write');
    assert.deepEqual(result.shardsWritten, []);
    assert.equal(result.inputEmpty, false);
    assert.equal(hashTree(project.specDir), before, 'nothing may be written for an unclaimed path');
  });

  it('test_when_a_touched_path_already_matches_an_element_anchor_then_it_is_not_unclaimed', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    writeGovernedFile(project.root, 'src/globbed.mjs');
    writeWorkspaceElement(project.specDir, 'globbed-family', { anchor: 'src/globbed*.mjs' });
    writeSpecWithDelta(project.root, SLUG, []);

    const result = runStep5(delta, project, ['src/alpha.mjs', 'src/globbed.mjs']);

    // The complement of the gap report. A path an element already anchors — file or
    // glob — is modelled, and reporting it would make the gap list cry wolf on every
    // landing until an operator stopped reading it.
    assert.deepEqual(result.unclaimed, [], 'a path an existing element anchors is already modelled');
  });

  it('test_when_a_touched_path_is_outside_the_governed_surface_then_it_is_not_unclaimed', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    mkdirSync(join(project.root, 'docs'), { recursive: true });
    writeFileSync(join(project.root, 'docs', 'notes.md'), '# notes\n', 'utf8');
    writeSpecWithDelta(project.root, SLUG, []);

    const result = runStep5(delta, project, ['docs/notes.md', 'README.md']);

    assert.deepEqual(result.unclaimed, [], 'only the GOVERNED surface can hold a coverage gap');
  });
});

// ─── AC-009 — Step 5.5 is report-only ───

describe('AC-009 — reconcile after Step 5 leaves the corpus byte-identical', () => {
  it('test_when_reconcile_runs_after_step_5_then_the_corpus_is_byte_identical', async () => {
    const delta = await loadDelta();
    const report = await tryImport(REPORT);
    assert.ok(report?.runReconcile, `${REPORT} does not export runReconcile`);
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    writeGovernedFile(project.root, ADD_FOO.anchor);
    writeSpecWithDelta(project.root, SLUG, [ADD_FOO]);

    const beforeStep5 = hashTree(project.specDir);
    runStep5(delta, project, ['src/foo_guard.mjs']);
    const afterStep5 = hashTree(project.specDir);

    report.runReconcile({ specDir: project.specDir, rootDir: project.root });

    // The test plan's concurrency/ordering row. Both halves matter: an inert Step 5
    // would satisfy the second assertion trivially, which is why the first one pins
    // that the write really happened.
    assert.notEqual(afterStep5, beforeStep5, 'Step 5 IS the writer — the corpus must change across it');
    assert.equal(hashTree(project.specDir), afterStep5, 'Step 5.5 is report-only — no write may follow it');
  });
});

// ─── AC-014 — inert while the flag is off ───

describe('AC-014 — the delta path is inert while the architecture-map flag is off', () => {
  for (const state of ['off', 'absent']) {
    it(`test_when_the_architecture_map_flag_is_${state}_then_the_whole_delta_path_is_inert`, async () => {
      const delta = await loadDelta();
      const project = makeFlaggedProject(state);
      seedCorpus(project);
      writeGovernedFile(project.root, ADD_FOO.anchor);
      writeGovernedFile(project.root, 'src/bar_guard.mjs');
      writeSpecWithDelta(project.root, SLUG, [ADD_FOO]);
      const before = hashTree(project.specDir);

      const result = runStep5(delta, project, ['src/foo_guard.mjs', 'src/bar_guard.mjs']);

      for (const key of ['confirmed', 'drift', 'unclaimed', 'applied', 'shardsWritten', 'skippedGlob']) {
        assert.deepEqual(result[key], [], `${key} must be empty while the flag is ${state}`);
      }
      assert.equal(hashTree(project.specDir), before, 'docs/system/ must be untouched while the flag is off');
    });
  }

  it('test_when_the_flag_is_off_then_a_hostile_row_still_does_not_throw', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('off');
    seedCorpus(project);
    writeSpecWithDelta(project.root, SLUG, [{ ...ADD_FOO, elementId: '..' }]);

    // Same ordering contract writeDiagramShard already holds (§Behavior #13): the
    // gate runs BEFORE validation, neither branch constructs a path, and pinning the
    // order stops a later refactor from making an opted-out project throw.
    assert.doesNotThrow(() => runStep5(delta, project, ['src/foo_guard.mjs']));
  });
});

// ─── The archive SOP — a verifier nothing calls is not a verifier ───

// Amended 2026-08-25 (release-safety, T8). Step 5.5 was report-only, and that is
// exactly how a degraded corpus write reached a commit: it printed the breach and
// left the decision to a reader. AC-023/AC-024 made it gate on a non-zero exit.
// What this guard defends is unchanged and was never the printing — Step 5.5 must
// still repair nothing, because Step 3 is the corpus's single writer.
describe('slice C wiring — /archive Step 5 calls the verifier and Step 5.5 repairs nothing', () => {
  it('test_when_the_archive_skill_is_read_then_step_5_calls_verify_and_apply_delta_and_step_5_5_repairs_nothing', () => {
    const text = readFileSync(ARCHIVE_SKILL, 'utf8');

    assert.match(text, /verifyAndApplyDelta/, 'Step 5 must invoke the one entry point D1 names');
    assert.ok(
      !/contribute\.mjs|syncBack/.test(text),
      'Step 5 must no longer instruct syncBack — the bare re-stamp is what this slice replaces',
    );
    assert.match(text, /^\s*5\.5\.?\s/m, 'a Step 5.5 must exist');
    assert.match(text, /system-reconcile/, 'Step 5.5 must name the report skill');
    assert.match(text, /repair nothing|no repair path/i, 'Step 5.5 must state that it repairs nothing');
    assert.match(text, /--gate/, 'Step 5.5 must invoke the gating form, not the bare report');

    // Two things the rewrite must carry forward rather than drop. The quoted-array
    // warning is a landmine that already cost one silent no-op; the flag gate is
    // what makes AC-014 true for an operator following the SOP by hand.
    assert.match(text, /quoted JSON array/, 'the zsh word-splitting warning must survive the rewrite');
    assert.match(text, /memory\.architecture_map\.enabled/, 'the flag gate must still scope the corpus block');
  });

  it('test_when_archive_sop_is_read_then_delta_verification_precedes_the_move', () => {
    const text = readFileSync(ARCHIVE_SKILL, 'utf8');
    const verifyAt = text.indexOf('verifyAndApplyDelta');
    const moveAt = text.indexOf('archive.sh');

    // Presence is asserted BEFORE the comparison on purpose. A rename would leave
    // both at -1, and `-1 < -1` is false, so the order check would fail for the
    // wrong reason — or worse, a single rename would leave one at -1 and pass
    // vacuously. That is the same "an absent thing reads like a present one"
    // ambiguity this whole scenario set exists to close.
    assert.notEqual(verifyAt, -1, 'the SOP must still invoke verifyAndApplyDelta');
    assert.notEqual(moveAt, -1, 'the SOP must still invoke archive.sh');

    assert.ok(
      verifyAt < moveAt,
      'the delta verification must run BEFORE archive.sh moves docs/specs/<slug>.md into the bundle — '
      + 'after the move resolveSpecPath returns null and the whole System delta table goes unread',
    );
  });
});

// ─── An unreadable spec is not an empty one ───

describe('an unresolvable spec is reported, not silently read as a spec that declared nothing', () => {
  it('test_when_the_spec_cannot_be_resolved_then_spec_missing_is_true', async () => {
    const delta = await loadDelta();
    const project = makeFlaggedProject('on');
    seedCorpus(project);
    // Deliberately NO writeSpecWithDelta: docs/specs/<SLUG>.md never exists, so
    // resolveSpecPath returns null. This is the state /archive Step 5 was left in
    // when Step 3 moved the spec into the bundle before Step 5 ever read it.
    const result = runStep5(delta, project, ['src/alpha.mjs']);

    assert.equal(result.specMissing, true, 'an unreadable spec must say so');
    assert.equal(result.inputEmpty, false, 'touchedPaths was populated — specMissing is the only flag that should fire');

    // These three are byte-identical to an honest "the spec declared nothing".
    // Without the flag above, the caller cannot tell the two apart, and a real
    // declared row goes unverified while the run reports clean.
    assert.deepEqual(result.confirmed, [], 'nothing can be confirmed from a spec that was never read');
    assert.deepEqual(result.drift, [], 'no rows were parsed, so none can be drift');
    assert.deepEqual(result.unclaimed, [], 'unclaimed is computed against parsed rows');
  });

  it('test_when_the_spec_resolves_but_matches_nothing_then_spec_missing_is_false', async () => {
    const delta = await loadDelta();

    const withSpec = makeFlaggedProject('on');
    seedCorpus(withSpec);
    writeGovernedFile(withSpec.root, ADD_FOO.anchor);
    writeSpecWithDelta(withSpec.root, SLUG, [ADD_FOO]);
    const readable = runStep5(delta, withSpec, ['src/alpha.mjs']);

    const withoutSpec = makeFlaggedProject('on');
    seedCorpus(withoutSpec);
    const unreadable = runStep5(delta, withoutSpec, ['src/alpha.mjs']);

    assert.equal(readable.specMissing, false, 'a spec that was read is not missing, even when no row confirms');
    assert.ok(readable.drift.length > 0, 'the declared row must surface as drift, which proves it was parsed');

    // The same rule the inputEmpty pair above encodes: two opposite situations must
    // be distinguishable by shape, not only by array length.
    assert.notDeepEqual(
      readable,
      unreadable,
      'a spec that parsed to no matches and a spec that could not be read must not share a return shape',
    );
  });
});
