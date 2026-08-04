// The corpus seed (AC-001, AC-002, AC-008, AC-009, AC-010).
//
// Slice E shipped its machinery and then delivered nothing because no step ever
// wrote a first element. These tests defend the seed itself: that it applies, that
// it refuses to invent links, and that every anchor points at something real.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { copyLiveCorpus, tryImport, CANONICAL_CATEGORIES, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { makeWorkspace } from './helpers/workspace-fixtures.mjs';
import { applyContribution } from '../.claude/skills/workspace/contribute.mjs';
import { readAll } from '../.claude/skills/workspace/store.mjs';
import { matchesGlob } from '../.claude/skills/memory-index/index-io.mjs';

const SEED = '.claude/skills/workspace/seed-elements.mjs';

// The live corpus is copied so the real decision/constraint keys resolve — an
// element naming an unresolvable key is refused, so a synthetic store would make
// every seed op fail for the wrong reason.
function seededProject(ops) {
  const { memDir } = copyLiveCorpus('wsseed-');
  makeWorkspace(memDir);
  const result = applyContribution({ memDir, slug: 'seed-test', ops });
  return { memDir, result };
}

async function seedOps() {
  const mod = await tryImport(SEED);
  assert.ok(mod, `${SEED} does not exist yet — the seed op set must be a named, testable export`);
  return mod.SEED_OPS;
}

describe('corpus seed', () => {
  it('test_when_seed_contribution_applied_then_fourteen_elements_exist', async () => {
    const ops = await seedOps();
    assert.equal(ops.length, 14, '17 declarations resolve, but they claim only 14 distinct anchors (spec D7)');

    // The property that actually matters. detectConflicts compares each op against
    // the PRE-EXISTING corpus, never against sibling ops, so same-anchor siblings
    // write cleanly the first time and then reject the whole contribution
    // atomically on re-apply. A duplicate here is silent until it is permanent.
    const anchors = ops.map((op) => op.fields.anchor);
    assert.equal(
      new Set(anchors).size,
      ops.length,
      `every anchor must be unique; duplicates: ${anchors.filter((a, i) => anchors.indexOf(a) !== i).join(', ')}`,
    );

    const { memDir, result } = seededProject(ops);
    assert.deepEqual(result.conflicts, [], 'the seed must apply cleanly');
    assert.equal(result.written.length, 14);
    assert.equal(readAll(memDir).elements.length, 14, 'all 14 must round-trip through readAll');
  });

  it('test_when_element_names_unresolvable_governed_by_then_refused', async () => {
    const { memDir } = copyLiveCorpus('wsseed-bad-');
    makeWorkspace(memDir);

    const result = applyContribution({
      memDir,
      slug: 'seed-test',
      ops: [{ verb: 'add', target_id: 'bogus-element', fields: { kind: 'component', anchor: 'x/**', governed_by: 'no-such-decision' } }],
    });

    assert.equal(result.written.length, 0, 'an element naming an unresolvable key must not be written');
    assert.equal(
      existsSync(join(memDir, 'workspace', 'elements', 'bogus-element.md')),
      false,
      'nothing may reach disk — an invented key blocks its own element (D4)',
    );
  });

  it('test_when_seed_applied_twice_then_idempotent_no_duplicates', async () => {
    const ops = await seedOps();
    const { memDir } = seededProject(ops);
    const again = applyContribution({ memDir, slug: 'seed-test', ops });

    assert.deepEqual(again.conflicts, [], 're-applying the identical seed must not raise a spurious conflict');
    assert.equal(readdirSync(join(memDir, 'workspace', 'elements')).length, 14, 'no duplicate element files');
  });

  it('test_when_seeded_element_removed_then_corpus_still_reads', async () => {
    const ops = await seedOps();
    const { memDir } = seededProject(ops);
    const victim = ops[0].target_id;

    const removed = applyContribution({ memDir, slug: 'seed-test', ops: [{ verb: 'remove', target_id: victim, fields: {} }] });
    assert.deepEqual(removed.conflicts, [], 'removing a seeded id is not a conflict');

    const { elements } = readAll(memDir);
    assert.equal(elements.length, 13);
    assert.ok(!elements.some((e) => e.id === victim), 'the removed element must be gone');
  });

  it('test_when_every_seeded_anchor_matched_then_at_least_one_real_path', async () => {
    const ops = await seedOps();
    // An anchor matching nothing is a dead element: scout would carry it forever
    // and never surface it against a real edit.
    const repoPaths = [
      '.claude/hooks/branch_guard.mjs',
      '.claude/hooks/lint_runner.mjs',
      '.claude/hooks/test_runner.mjs',
      '.claude/hooks/lib/common.mjs',
      '.claude/hooks/lib/scoped-memory.mjs',
      '.claude/hooks/lib/governed-memory.mjs',
      '.claude/hooks/process_lifecycle_guard.mjs',
      '.claude/schemas/workflow-track.v1.json',
      '.claude/skills/triage/track-tasklist-materializer.js',
      '.claude/skills/triage/workflows-validator-invariants.js',
      '.claude/skills/memory-index/resolve.mjs',
      '.claude/skills/memory-index/index-io.mjs',
      '.claude/mcp/sprint-channel/server.mjs',
      '.claude/mcp/sprint-channel/handlers.mjs',
      '.github/workflows/release.yml',
    ];

    for (const op of ops) {
      const anchor = op.fields.anchor;
      assert.ok(anchor, `${op.target_id} must declare an anchor`);
      assert.ok(
        repoPaths.some((p) => matchesGlob(anchor, p)) || existsSync(join(REPO_ROOT, anchor.replace(/\/\*\*$/, ''))),
        `${op.target_id}: anchor ${anchor} matches no real path`,
      );
    }
  });

  it('test_when_corpus_seeded_then_canonical_still_has_eight', async () => {
    const ops = await seedOps();
    seededProject(ops);
    assert.equal(CANONICAL_CATEGORIES.length, 8, 'the corpus must not become a ninth canonical category');
    assert.ok(!CANONICAL_CATEGORIES.includes('workspace'));
  });
});
