// T4 / D-7 — the corpus element id follows the rename (AC-021).
//
// D-7 is an engineer decision that knowingly relaxes an invariant: archive/SKILL.md
// names /archive Step 3 the sole writer of docs/system/, and this rename writes
// the element file directly inside T4's diff. The relaxation is bounded to ONE
// file, and this test is what makes it measured rather than assumed.
//
// The one dangling reference is expected, not a defect: the spec's own System
// delta row names the OLD element id, because a `change` row's element must
// resolve when spec-lint runs at draft time. Asserting "exactly one, and it is
// that one" is stricter than asserting "clean" — it would catch a second,
// unintended dangler that a CLEAN-or-not check would hide.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { REPO_ROOT, readFileSync, existsSync } from './helpers/memory-fixtures.mjs';
import { runCliJson, assertPresent } from './helpers/cli-runner.mjs';

const ELEMENTS = 'docs/system/elements';
const NEW_ID = ['memory', 'sync'].join('-') + '-helpers';
const OLD_ID = ['memory', 'flush'].join('-') + '-helpers';

function frontmatter(id) {
  const text = readFileSync(join(REPO_ROOT, ELEMENTS, `${id}.md`), 'utf8');
  return Object.fromEntries(
    text.split('---')[1].trim().split('\n').map((line) => {
      const at = line.indexOf(':');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
}

describe('corpus element rename', () => {
  // AC-021 — the element file moved.
  it('test_when_system_reconcile_runs_after_hand_rename_then_one_dangling_ref_and_no_other_defect', () => {
    const newPath = join(REPO_ROOT, ELEMENTS, `${NEW_ID}.md`);
    assert.ok(existsSync(newPath), `${ELEMENTS}/${NEW_ID}.md must exist — D-7 hand-renames the element inside T4's diff`);
    assert.ok(
      !existsSync(join(REPO_ROOT, ELEMENTS, `${OLD_ID}.md`)),
      'the old element file must be gone; leaving both would duplicate the anchor',
    );

    const meta = frontmatter(NEW_ID);
    assert.equal(meta.id, NEW_ID, 'the element id must match its filename');
    assert.equal(meta.kind, 'component', 'kind is carried over unchanged — the rename moves identity, not shape');
    assert.match(
      meta.anchor,
      /\.claude\/skills\/memory-sync\//,
      `the anchor must point at the renamed skill directory; got ${meta.anchor}`,
    );

    const res = runCliJson('system-reconcile', ['report', '--json']);
    assertPresent(assert, res);

    // AC-021 predicted exactly ONE dangling reference — the spec's own delta row
    // naming the old id. That prediction was wrong about what /system-reconcile
    // reads: it walks corpus-internal anchors (element -> shard -> concept) and
    // never opens a spec's System delta table. The delta row's id is checked by
    // /spec-lint at draft time and by /archive Step 3 at landing time, not here.
    //
    // So the real claim is stronger, and this asserts the stronger one: the
    // hand-rename left the corpus with NO structural defect of any kind.
    for (const key of ['dangling', 'duplicateAnchors', 'orphanShards', 'missingKind']) {
      const defects = res.json?.[key];
      assert.ok(Array.isArray(defects), `reconcile report must carry a \`${key}\` list; got ${JSON.stringify(res.json).slice(0, 200)}`);
      assert.deepEqual(defects, [], `the hand-rename must introduce no ${key}; got ${JSON.stringify(defects)}`);
    }

    // `stale` is deliberately NOT asserted empty. An anchor-digest goes stale the
    // moment the interface behind it moves, which is what a workflow that edits
    // code is FOR; /archive Step 3 re-stamps them. Requiring zero here would fail
    // every workflow that touched a governed file.
    assert.ok(Array.isArray(res.json?.stale), 'reconcile report must carry a `stale` list');
  });
});
