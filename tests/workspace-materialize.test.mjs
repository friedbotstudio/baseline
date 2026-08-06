// Materializing the authored concept map (AC-003, AC-005).
//
// D5: the authored artifact is the concept-to-anchor map, not ~50 hand-written
// element records. Hand-transcription is how seed-elements.mjs froze — it never
// learned about the 7 modules the architecture-map cycle shipped. Elements are
// therefore materialized FROM the map, and membership follows from which concept
// declared each anchor.
//
// D6: conflicts.duplicateAnchor rejects two ids claiming one anchor, so an anchor
// declared by two concepts must yield ONE element in two concepts. That is also
// what finally realizes ticket A's git_commit_guard example.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { copyLiveCorpus, makeProject, tryImport, snapshotTree, REPO_ROOT } from './helpers/memory-fixtures.mjs';

const MATERIALIZE = '.claude/skills/workspace/materialize.mjs';
const SPEC_DIR = 'docs/system';
const CONCEPTS = '.claude/skills/workspace/concepts.mjs';

// The authored map now lives in the concept FILES, so the fixture must carry them:
// an empty specDir yields an empty map and materializes nothing. It used to work
// because the map came from a shipped constant independent of the corpus.
async function materializeInto() {
  const materialize = await tryImport(MATERIALIZE);
  if (!materialize) return null;
  const { specDir } = copyLiveCorpus('wsmaterialize-');
  const result = materialize.materialize({ specDir, rootDir: REPO_ROOT });
  return { materialize, specDir, result };
}

describe('materialize the authored concept map', () => {
  it('test_when_map_materialized_then_every_concept_has_members', async () => {
    const ctx = await materializeInto();
    assert.ok(ctx, `${MATERIALIZE} does not exist yet`);
    const concepts = await tryImport(CONCEPTS);
    assert.ok(concepts, `${CONCEPTS} does not exist yet`);

    const all = concepts.readConcepts(ctx.specDir);

    assert.equal(all.length, 15, 'the concept set ships at 15 nodes');
    const empty = all.filter((c) => !(c.members || []).length).map((c) => c.id);
    assert.deepEqual(empty, [], 'no concept may resolve to nothing — that is the gap this cycle closes');
  });

  it('test_when_map_materialized_then_every_member_resolves_on_disk', async () => {
    const ctx = await materializeInto();
    assert.ok(ctx, `${MATERIALIZE} does not exist yet`);
    const concepts = await tryImport(CONCEPTS);
    assert.ok(concepts, `${CONCEPTS} does not exist yet`);

    const missing = [];
    for (const concept of concepts.readConcepts(ctx.specDir)) {
      for (const member of concept.members || []) {
        if (!existsSync(join(ctx.specDir, 'elements', `${member}.md`))) {
          missing.push(`${concept.id} -> ${member}`);
        }
      }
    }
    assert.deepEqual(missing, [], 'a member naming no element asserts a membership that does not exist');
  });

  it('test_when_anchor_declared_by_two_concepts_then_one_element_two_memberships', async () => {
    const ctx = await materializeInto();
    assert.ok(ctx, `${MATERIALIZE} does not exist yet`);
    const concepts = await tryImport(CONCEPTS);
    assert.ok(concepts, `${CONCEPTS} does not exist yet`);

    const owning = concepts.readConcepts(ctx.specDir)
      .filter((c) => (c.members || []).includes('git-commit-guard'))
      .map((c) => c.id)
      .sort();

    assert.deepEqual(owning, ['consent-gates', 'git-policy'],
      "ticket A's own done_record names this case; it was unrealized until now");
    assert.ok(existsSync(join(ctx.specDir, 'elements', 'git-commit-guard.md')),
      'exactly one element file backs both memberships');
  });

  it('test_when_member_unresolvable_then_materialization_aborts_atomically', async () => {
    const materialize = await tryImport(MATERIALIZE);
    assert.ok(materialize, `${MATERIALIZE} does not exist yet`);
    const { specDir } = makeProject();
    const before = snapshotTree(specDir);

    const badMap = { 'broken-concept': [{ id: 'nope', anchor: 'does/not/exist/anywhere.mjs', title: 'Nope' }] };
    assert.throws(
      () => materialize.materialize({ specDir, rootDir: REPO_ROOT, map: badMap }),
      /unresolvable|dangling|nope/i,
    );

    assert.deepEqual(snapshotTree(specDir), before,
      'a partial corpus reflects an intent no contributor had and no reviewer approved');
  });

  it('test_when_materialize_runs_twice_then_second_run_is_noop', async () => {
    const ctx = await materializeInto();
    assert.ok(ctx, `${MATERIALIZE} does not exist yet`);
    const afterFirst = snapshotTree(ctx.specDir);

    ctx.materialize.materialize({ specDir: ctx.specDir, rootDir: REPO_ROOT });

    assert.deepEqual(snapshotTree(ctx.specDir), afterFirst, 'materialization is idempotent');
  });

  it('test_when_map_read_then_every_declared_anchor_resolves', async () => {
    const concepts = await tryImport('.claude/skills/workspace/concepts.mjs');
    assert.ok(concepts, 'concepts.mjs does not exist yet');
    const coverage = await tryImport('.claude/skills/workspace/coverage.mjs');
    assert.ok(coverage, 'coverage.mjs does not exist yet');

    const governed = coverage.governedFiles({ rootDir: REPO_ROOT });
    const dangling = [];
    for (const [concept, rows] of Object.entries(concepts.readConceptMap(SPEC_DIR))) {
      for (const row of rows) {
        if (!governed.some((f) => coverage.anchorMatches(row.anchor, f))) dangling.push(`${concept}:${row.anchor}`);
      }
    }
    assert.deepEqual(dangling, [], 'an authored anchor matching nothing ships a dangling element');
  });
});
