// Ticket D — three-case staleness (AC-013..AC-016, AC-021, AC-022).
//
// The whole point of digesting a STRUCTURAL INTERFACE rather than bytes: a comment,
// a JSON value, or a paragraph of prose changing must NOT demote a diagram, while a
// renamed export, an added key, or a renamed heading must. Digesting whole files
// would make every element stale on every typo — the churn spec D7/D11 exist to stop.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';

const RECONCILE = '.claude/skills/workspace/reconcile.mjs';

function writeAnchored(root, rel, lines) {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, lines.join('\n') + '\n', 'utf8');
  return abs;
}

// Digest the file, register an element carrying that digest, then rewrite the file
// and re-classify. Returns the verdict state for the element.
async function reclassify(reconcile, { rel, before, after }) {
  const { root, memDir } = makeProject();
  makeWorkspace(memDir);
  writeAnchored(root, rel, before);
  const digest = reconcile.digestFor(join(root, rel));
  writeWorkspaceElement(memDir, 'subject', { anchor: rel, anchor_digest: digest });
  writeAnchored(root, rel, after);
  const verdicts = reconcile.classify(memDir, { rootDir: root });
  return (verdicts.find((v) => v.element_id === 'subject') || {}).state;
}

describe('D — three-case staleness', () => {
  it('test_when_comment_only_edit_then_element_not_stale', async () => {
    const reconcile = await tryImport(RECONCILE);
    assert.ok(reconcile, `${RECONCILE} does not exist yet`);
    const state = await reclassify(reconcile, {
      rel: 'lib/thing.mjs',
      before: ['// original note', 'export function alpha() { return 1; }'],
      after: ['// a completely rewritten note explaining why', 'export function alpha() { return 1; }'],
    });
    assert.notEqual(state, 'stale', 'a comment-only edit must NOT demote the element');
  });

  it('test_when_exported_symbol_renamed_then_element_stale', async () => {
    const reconcile = await tryImport(RECONCILE);
    assert.ok(reconcile, `${RECONCILE} does not exist yet`);
    const state = await reclassify(reconcile, {
      rel: 'lib/thing.mjs',
      before: ['export function alpha() { return 1; }'],
      after: ['export function renamed() { return 1; }'],
    });
    assert.equal(state, 'stale', 'renaming an exported symbol changes the interface — the element is stale');
  });

  it('test_when_json_value_changes_but_keys_stable_then_not_stale', async () => {
    const reconcile = await tryImport(RECONCILE);
    assert.ok(reconcile, `${RECONCILE} does not exist yet`);
    const state = await reclassify(reconcile, {
      rel: 'conf/settings.json',
      before: [JSON.stringify({ a: 1, nested: { b: 'x' } }, null, 2)],
      after: [JSON.stringify({ a: 999, nested: { b: 'totally different' } }, null, 2)],
    });
    assert.notEqual(state, 'stale', 'a JSON value change with stable key paths must NOT demote the element');
  });

  it('test_when_json_key_added_then_stale', async () => {
    const reconcile = await tryImport(RECONCILE);
    assert.ok(reconcile, `${RECONCILE} does not exist yet`);
    const state = await reclassify(reconcile, {
      rel: 'conf/settings.json',
      before: [JSON.stringify({ a: 1 }, null, 2)],
      after: [JSON.stringify({ a: 1, newKey: 2 }, null, 2)],
    });
    assert.equal(state, 'stale', 'adding a JSON key changes the interface — the element is stale');
  });

  it('test_when_md_prose_changes_but_headings_stable_then_not_stale', async () => {
    const reconcile = await tryImport(RECONCILE);
    assert.ok(reconcile, `${RECONCILE} does not exist yet`);
    const state = await reclassify(reconcile, {
      rel: 'docs/page.md',
      before: ['# Title', '', 'Original paragraph.', '', '## Section', '', 'More text.'],
      after: ['# Title', '', 'A wholly rewritten paragraph with new wording.', '', '## Section', '', 'Different text again.'],
    });
    assert.notEqual(state, 'stale', 'a prose rewrite under stable headings must NOT demote the element');
  });

  it('test_when_md_heading_renamed_then_stale', async () => {
    const reconcile = await tryImport(RECONCILE);
    assert.ok(reconcile, `${RECONCILE} does not exist yet`);
    const state = await reclassify(reconcile, {
      rel: 'docs/page.md',
      before: ['# Title', '', '## Section', '', 'Body.'],
      after: ['# Title', '', '## Renamed Section', '', 'Body.'],
    });
    assert.equal(state, 'stale', 'renaming a heading changes the document interface — the element is stale');
  });

  it('test_when_anchor_matches_nothing_then_dangling_and_excluded', async () => {
    const reconcile = await tryImport(RECONCILE);
    assert.ok(reconcile, `${RECONCILE} does not exist yet`);
    const { root, memDir } = makeProject();
    makeWorkspace(memDir);
    const abs = writeAnchored(root, 'lib/gone.mjs', ['export const g = 1;']);
    const digest = reconcile.digestFor(abs);
    writeWorkspaceElement(memDir, 'subject', { anchor: 'lib/gone.mjs', anchor_digest: digest });
    rmSync(abs);

    const verdicts = reconcile.classify(memDir, { rootDir: root });
    const v = verdicts.find((x) => x.element_id === 'subject');
    assert.equal(v.state, 'dangling', 'an anchor matching nothing is dangling, fail-closed');
    assert.ok(reconcile.composableElements(memDir, { rootDir: root }).every((e) => e !== 'subject'),
      'a dangling element must be excluded from view composition');
  });

  it('test_when_anchor_glob_has_traversal_then_rejected_before_read', async () => {
    const reconcile = await tryImport(RECONCILE);
    assert.ok(reconcile, `${RECONCILE} does not exist yet`);
    const { root, memDir } = makeProject();
    makeWorkspace(memDir);
    writeWorkspaceElement(memDir, 'escaper', { anchor: '../../etc/**' });

    assert.throws(
      () => reconcile.classify(memDir, { rootDir: root }),
      /traversal|unsafe/i,
      'a traversal anchor must be REJECTED, never normalized, and before any filesystem read',
    );
  });
});
