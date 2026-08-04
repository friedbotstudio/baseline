// Ticket E1 — workspace store and element schema (AC-001, AC-002, AC-012).
//
// The corpus is a durable structural model, NOT a ninth memory category. The last
// test in this file is the regression that defends that boundary: seven of nine
// hardcoded category surfaces failed silently the last time the list moved
// (landmine: canonical-category-list-spans-nine-surfaces).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, join, makeProject, tryImport, writeShard, CANONICAL_CATEGORIES } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const STORE = '.claude/skills/workspace/store.mjs';
const REFS = '.claude/skills/workspace/refs.mjs';

function seedGovernedDecision(memDir, key) {
  writeShard(memDir, 'decisions', key, { key, fields: { governs: '.claude/skills/**' }, bodyLines: ['- Decision body.'] });
}

describe('E1 — element write and key resolution', () => {
  it('test_when_element_with_resolving_refs_added_then_round_trips', async () => {
    const store = await tryImport(STORE);
    assert.ok(store, `${STORE} does not exist yet`);
    const { memDir } = makeProject();
    makeWorkspace(memDir);
    seedGovernedDecision(memDir, 'd-one');

    store.writeElement(memDir, {
      id: 'workspace-skill',
      kind: 'component',
      title: 'Workspace skill',
      anchor: '.claude/skills/workspace/**',
      governed_by: ['d-one'],
    });

    const { elements } = store.readAll(memDir);
    const found = elements.find((e) => e.id === 'workspace-skill');
    assert.ok(found, 'element did not round-trip through readAll');
    assert.equal(found.anchor, '.claude/skills/workspace/**');
    assert.deepEqual(found.governed_by, ['d-one']);
  });

  it('test_when_element_id_is_unsafe_then_rejected_no_path_escape', async () => {
    const store = await tryImport(STORE);
    assert.ok(store, `${STORE} does not exist yet`);
    const { memDir } = makeProject();
    makeWorkspace(memDir);

    for (const bad of ['../escape', '', 'has space', 'Ünicode']) {
      assert.throws(
        () => store.writeElement(memDir, { id: bad, kind: 'component', anchor: 'x/**' }),
        /unsafe/i,
        `id ${JSON.stringify(bad)} should be rejected, never normalized`,
      );
    }
    assert.equal(readdirSync(join(memDir, 'workspace', 'elements')).length, 0, 'no file may be written for a rejected id');
  });

  it('test_when_element_references_missing_constraint_key_then_reported_and_not_written', async () => {
    const refs = await tryImport(REFS);
    const store = await tryImport(STORE);
    assert.ok(refs && store, `${REFS} / ${STORE} do not exist yet`);
    const { memDir } = makeProject();
    makeWorkspace(memDir);

    const report = refs.resolveRefs(memDir, { governed_by: [], rests_on: ['no-such-constraint'] });
    assert.deepEqual(report.unresolved, ['no-such-constraint'], 'the missing key must be named in the report');
    assert.equal(readdirSync(join(memDir, 'workspace', 'elements')).length, 0, 'element must NOT be written when a ref is unresolved');
  });

  it('test_when_workspace_dir_absent_then_preflight_error_and_no_partial_store', async () => {
    const store = await tryImport(STORE);
    assert.ok(store, `${STORE} does not exist yet`);
    const { memDir } = makeProject();

    const ready = store.ensureWorkspace(memDir);
    assert.equal(ready.ready, false, 'absent workspace must report not-ready');
    assert.match(ready.reason, /workspace/i, 'the preflight error must name the workspace');
    assert.equal(existsSync(join(memDir, 'workspace')), false, 'preflight must not create a partial store');
  });

  it('test_when_element_frontmatter_malformed_then_entry_skipped_siblings_read', async () => {
    const store = await tryImport(STORE);
    assert.ok(store, `${STORE} does not exist yet`);
    const { memDir } = makeProject();
    const dir = makeWorkspace(memDir);
    writeWorkspaceElement(memDir, 'good-one', { anchor: 'a/**' });
    writeWorkspaceElement(memDir, 'good-two', { anchor: 'b/**' });
    writeFileSync(join(dir, 'broken.md'), 'no frontmatter at all\n', 'utf8');

    const { elements } = store.readAll(memDir);
    const ids = elements.map((e) => e.id).sort();
    assert.deepEqual(ids, ['good-one', 'good-two'], 'a malformed element must be skipped per-entry, siblings still read');
  });

  it('test_when_workspace_ships_then_canonical_still_has_eight_categories', async () => {
    assert.equal(CANONICAL_CATEGORIES.length, 8, 'the workspace must not become a ninth canonical category');
    assert.ok(!CANONICAL_CATEGORIES.includes('workspace'), 'workspace must not appear in CANONICAL');
    const src = readFileSync(join(process.cwd(), '.claude/skills/memory-index/categories.mjs'), 'utf8');
    assert.ok(!/['"]workspace['"]/.test(src), 'categories.mjs must not reference workspace');
  });
});
