// Digest stamping (AC-001, AC-007).
//
// The prior cycle shipped digestFor() and a classify() that reads a STORED digest,
// but nothing ever wrote one — so `reconcile.mjs`'s stale branch guarded on
// `element.anchor_digest &&` and was unreachable for all 14 elements. These tests
// pin the production write path that makes it reachable.
//
// The load-bearing absence is stampAll's refusal without an explicit id list: a
// stamp-everything default would make classify() permanently green and launder the
// drift the digest exists to catch (spec D3).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';

const DIGEST = '.claude/skills/workspace/digest.mjs';

function writeAnchored(root, rel, lines) {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, lines.join('\n') + '\n', 'utf8');
  return abs;
}

function frontmatterOf(specDir, id) {
  return readFileSync(join(specDir, 'elements', `${id}.md`), 'utf8');
}

describe('digest stamping', () => {
  it('test_when_anchor_resolves_then_digest_is_persisted', async () => {
    const digest = await tryImport(DIGEST);
    assert.ok(digest, `${DIGEST} does not exist yet`);
    const { root, specDir } = makeProject();
    makeWorkspace(specDir);
    writeAnchored(root, 'lib/thing.mjs', ['export function alpha() { return 1; }']);
    writeWorkspaceElement(specDir, 'subject', { anchor: 'lib/thing.mjs' });

    const result = digest.stampElement(specDir, 'subject', { rootDir: root });

    assert.match(result.digest, /^[0-9a-f]{12}$/, 'digest is sha256 truncated to 12 hex chars');
    assert.match(frontmatterOf(specDir, 'subject'), /^anchor_digest: [0-9a-f]{12}$/m,
      'the digest is persisted into the element frontmatter, not just returned');
  });

  it('test_when_anchor_is_dangling_then_no_digest_and_reported', async () => {
    const digest = await tryImport(DIGEST);
    assert.ok(digest, `${DIGEST} does not exist yet`);
    const { root, specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'ghost', { anchor: 'lib/never-existed.mjs' });

    const result = digest.stampElement(specDir, 'ghost', { rootDir: root });

    assert.equal(result.digest, null);
    assert.equal(result.state, 'dangling');
    assert.doesNotMatch(frontmatterOf(specDir, 'ghost'), /anchor_digest:/,
      'a digest over a missing file would assert the model matches code that is not there');
  });

  it('test_when_anchor_contains_traversal_then_throws_before_read', async () => {
    const digest = await tryImport(DIGEST);
    assert.ok(digest, `${DIGEST} does not exist yet`);
    const { root, specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'evil', { anchor: '../../etc/passwd' });

    assert.throws(() => digest.stampElement(specDir, 'evil', { rootDir: root }), /traversal|\.\./i,
      'CWE-22: the anchor is frontmatter content, so it is rejected before any path is built');
  });

  it('test_when_stamp_all_called_without_ids_then_throws', async () => {
    const digest = await tryImport(DIGEST);
    assert.ok(digest, `${DIGEST} does not exist yet`);
    const { root, specDir } = makeProject();
    makeWorkspace(specDir);
    writeAnchored(root, 'lib/a.mjs', ['export const a = 1;']);
    writeWorkspaceElement(specDir, 'a', { anchor: 'lib/a.mjs' });
    const before = frontmatterOf(specDir, 'a');

    assert.throws(() => digest.stampAll(specDir, undefined, { rootDir: root }), /explicit|id list|required/i,
      'D3: there is no stamp-everything entry point to reach for');
    assert.equal(frontmatterOf(specDir, 'a'), before, 'the refusal leaves every element untouched');
  });

  it('test_when_stamp_all_given_ids_then_only_those_are_stamped', async () => {
    const digest = await tryImport(DIGEST);
    assert.ok(digest, `${DIGEST} does not exist yet`);
    const { root, specDir } = makeProject();
    makeWorkspace(specDir);
    writeAnchored(root, 'lib/a.mjs', ['export const a = 1;']);
    writeAnchored(root, 'lib/b.mjs', ['export const b = 2;']);
    writeWorkspaceElement(specDir, 'a', { anchor: 'lib/a.mjs' });
    writeWorkspaceElement(specDir, 'b', { anchor: 'lib/b.mjs' });

    const result = digest.stampAll(specDir, ['a'], { rootDir: root });

    assert.deepEqual(result.stamped, ['a']);
    assert.match(frontmatterOf(specDir, 'a'), /anchor_digest:/);
    assert.doesNotMatch(frontmatterOf(specDir, 'b'), /anchor_digest:/,
      'an unreviewed element keeps no digest, so it keeps surfacing as stale');
  });

  it('test_when_stamped_twice_with_unchanged_source_then_digest_is_identical', async () => {
    const digest = await tryImport(DIGEST);
    assert.ok(digest, `${DIGEST} does not exist yet`);
    const { root, specDir } = makeProject();
    makeWorkspace(specDir);
    writeAnchored(root, 'lib/thing.mjs', ['export function alpha() { return 1; }']);
    writeWorkspaceElement(specDir, 'subject', { anchor: 'lib/thing.mjs' });

    const first = digest.stampElement(specDir, 'subject', { rootDir: root }).digest;
    const second = digest.stampElement(specDir, 'subject', { rootDir: root }).digest;

    assert.equal(first, second, 'stamping is idempotent — re-running a curation pass is not a change');
  });
});

// Staleness through the production stamping path (AC-006).
//
// The existing staleness suite proves classify() returns `stale` when a digest is
// ALREADY present — it hand-writes anchor_digest into the fixture. What was never
// proven is that any production path puts one there, which is exactly why the
// branch was unreachable across all 14 live elements. This closes that loop.
//
// Note for anyone grepping: AC-006 is overloaded across two specs. Here it is
// "renamed export flips classify() to stale" (workspace-corpus-backfill); in
// reconcile.mjs and workspace-reconcile.test.mjs it is the architecture-map cycle's
// scout-reconciliation AC. Same string, different claim.
describe('staleness is reachable through the production stamping path', () => {
  it('test_when_production_stamped_then_renamed_export_classifies_stale', async () => {
    const digest = await tryImport(DIGEST);
    assert.ok(digest, `${DIGEST} does not exist yet`);
    const reconcile = await tryImport('.claude/skills/workspace/reconcile.mjs');
    assert.ok(reconcile, 'reconcile.mjs does not exist yet');
    const { root, specDir } = makeProject();
    makeWorkspace(specDir);
    writeAnchored(root, 'lib/thing.mjs', ['export function alpha() { return 1; }']);
    writeWorkspaceElement(specDir, 'subject', { anchor: 'lib/thing.mjs' });

    digest.stampElement(specDir, 'subject', { rootDir: root });
    const before = reconcile.classify(specDir, { rootDir: root }).find((v) => v.element_id === 'subject');
    writeAnchored(root, 'lib/thing.mjs', ['export function renamed() { return 1; }']);
    const after = reconcile.classify(specDir, { rootDir: root }).find((v) => v.element_id === 'subject');

    assert.notEqual(before.state, 'stale', 'freshly stamped, the element is not stale');
    assert.equal(after.state, 'stale', 'no hand-written digest anywhere — the production path made this reachable');
  });
});
