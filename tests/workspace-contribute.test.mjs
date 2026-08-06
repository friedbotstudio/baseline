// Ticket E2 — contribution and merge semantics (AC-003, AC-004, AC-005).
//
// Spec decisions D1/D2: identity is a declared id:, a contribution is typed
// add/update/remove ops, and conflicts are REPORTED, never auto-resolved. The
// rejection is ATOMIC — a contribution with any conflict writes nothing, so a
// partially-applied corpus is not a reachable state.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyLiveCorpus, join, makeProject, tryImport } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';
import { existsSync, readdirSync } from 'node:fs';

const CONTRIBUTE = '.claude/skills/workspace/contribute.mjs';
const CONFLICTS = '.claude/skills/workspace/conflicts.mjs';
const STORE = '.claude/skills/workspace/store.mjs';

function elementIds(specDir) {
  return readdirSync(join(specDir, 'elements')).map((n) => n.replace(/\.md$/, '')).sort();
}

describe('E2 — contribution and merge semantics', () => {
  // Ported from the retired workspace-seed suite: it never exercised SEED_OPS, and
  // it is the only coverage of resolveRefs refusal (D4 — an element may not assert
  // a governing reason that does not exist). The live corpus is copied so real
  // decision keys resolve and the refusal is provably about the invented one.
  it('test_when_element_names_unresolvable_governed_by_then_refused', async () => {
    const contribute = await tryImport(CONTRIBUTE);
    assert.ok(contribute, `${CONTRIBUTE} does not exist yet`);
    const { memDir, specDir } = copyLiveCorpus('wscontrib-bad-');
    makeWorkspace(specDir);

    const result = contribute.applyContribution({
      specDir,
      memDir,
      slug: 'contribute-test',
      ops: [{ verb: 'add', target_id: 'bogus-element', fields: { kind: 'component', anchor: 'x/**', governed_by: 'no-such-decision' } }],
    });

    assert.equal(result.written.length, 0, 'an element naming an unresolvable key must not be written');
    assert.equal(
      existsSync(join(specDir, 'elements', 'bogus-element.md')),
      false,
      'nothing may reach disk — an invented key blocks its own element (D4)',
    );
  });

  it('test_when_two_disjoint_slices_contribute_then_both_survive', async () => {
    const contribute = await tryImport(CONTRIBUTE);
    assert.ok(contribute, `${CONTRIBUTE} does not exist yet`);
    const { memDir, specDir } = makeProject();
    makeWorkspace(specDir);

    const first = contribute.applyContribution({
      specDir,
      memDir,
      slug: 'slice-p',
      ops: [{ verb: 'add', target_id: 'e1', fields: { kind: 'component', anchor: 'p/**' } }],
    });
    assert.deepEqual(first.conflicts, [], 'first contribution should be clean');

    const second = contribute.applyContribution({
      specDir,
      memDir,
      slug: 'slice-q',
      ops: [{ verb: 'add', target_id: 'e2', fields: { kind: 'component', anchor: 'q/**' } }],
    });
    assert.deepEqual(second.conflicts, [], 'disjoint second contribution should be clean');

    assert.deepEqual(elementIds(specDir), ['e1', 'e2'], 'extension, not replacement — both contributions must survive');
  });

  it('test_when_two_ids_share_one_anchor_then_duplicate_anchor_conflict_and_nothing_written', async () => {
    const contribute = await tryImport(CONTRIBUTE);
    assert.ok(contribute, `${CONTRIBUTE} does not exist yet`);
    const { memDir, specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'e1', { anchor: '.claude/hooks/**' });

    const result = contribute.applyContribution({
      specDir,
      memDir,
      slug: 'slice-q',
      ops: [
        { verb: 'add', target_id: 'e2', fields: { kind: 'component', anchor: '.claude/hooks/**' } },
        { verb: 'add', target_id: 'e3', fields: { kind: 'component', anchor: 'unrelated/**' } },
      ],
    });

    assert.equal(result.conflicts.length, 1, 'exactly one duplicate-anchor conflict expected');
    assert.equal(result.conflicts[0].kind, 'duplicate-anchor');
    assert.equal(result.conflicts[0].target_id, 'e2');
    assert.deepEqual(result.written, [], 'a conflicting contribution writes nothing');
    assert.deepEqual(elementIds(specDir), ['e1'], 'rejection is ATOMIC — the clean sibling op must not land either');
  });

  it('test_when_remove_targets_absent_id_then_unknown_id_conflict_not_silent_noop', async () => {
    const contribute = await tryImport(CONTRIBUTE);
    const conflicts = await tryImport(CONFLICTS);
    assert.ok(contribute && conflicts, `${CONTRIBUTE} / ${CONFLICTS} do not exist yet`);
    const { memDir, specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'e1', { anchor: 'p/**' });

    for (const verb of ['remove', 'update']) {
      const result = contribute.applyContribution({
        specDir,
        slug: 'slice-q',
        ops: [{ verb, target_id: 'ghost', fields: {} }],
      });
      assert.equal(result.conflicts.length, 1, `${verb} against an absent id must conflict, not silently no-op`);
      assert.equal(result.conflicts[0].kind, 'unknown-id');
      assert.equal(result.conflicts[0].target_id, 'ghost');
    }
    assert.deepEqual(elementIds(specDir), ['e1'], 'corpus unchanged after rejected ops');
  });

  it('test_when_same_contribution_applied_twice_then_second_is_noop_no_spurious_conflict', async () => {
    const contribute = await tryImport(CONTRIBUTE);
    assert.ok(contribute, `${CONTRIBUTE} does not exist yet`);
    const { memDir, specDir } = makeProject();
    makeWorkspace(specDir);

    const ops = [{ verb: 'add', target_id: 'e1', fields: { kind: 'component', anchor: 'p/**' } }];
    contribute.applyContribution({ specDir, slug: 'slice-p', ops });
    const again = contribute.applyContribution({ specDir, slug: 'slice-p', ops });

    assert.deepEqual(again.conflicts, [], 're-applying an identical contribution must not raise a spurious conflict');
    assert.deepEqual(elementIds(specDir), ['e1'], 'idempotent — no duplicate element');
  });
});
