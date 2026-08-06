// Derived fields are never persisted (AC-002).
//
// The archived architecture-map spec's Migration steps 3-4 add `shard` and
// `granularity` to every element record, but its own D1 says altitude is "a
// function, not a field" — and both are already derived at read (concepts.mjs
// derives granularity from anchor shape; shards.readShard derives the path by
// convention). Persisting either creates a second source of truth that can
// disagree with the first, so this cycle drops both from the migration and pins
// the drop with a test.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, writeWorkspaceShard } from './helpers/workspace-fixtures.mjs';

const STORE = '.claude/skills/workspace/store.mjs';
const SHARDS = '.claude/skills/workspace/shards.mjs';

function rawElement(specDir, id) {
  return readFileSync(join(specDir, 'elements', `${id}.md`), 'utf8');
}

describe('derived fields are not persisted', () => {
  it('test_when_write_element_given_derived_fields_then_they_are_dropped', async () => {
    const store = await tryImport(STORE);
    assert.ok(store, `${STORE} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);

    store.writeElement(specDir, {
      id: 'subject',
      kind: 'component',
      title: 'Subject',
      anchor: 'lib/thing.mjs',
      granularity: 'component',
      shard: 'diagrams/subject.puml',
    });

    const raw = rawElement(specDir, 'subject');
    assert.doesNotMatch(raw, /^granularity:/m, 'granularity is derived from anchor shape, never stored');
    assert.doesNotMatch(raw, /^shard:/m, 'the shard path is derived by convention, never stored');
    assert.match(raw, /^anchor: lib\/thing\.mjs$/m, 'the anchor — which is authored — still persists');
  });

  it('test_when_read_after_write_then_granularity_derives_from_anchor_shape', async () => {
    const store = await tryImport(STORE);
    assert.ok(store, `${STORE} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    store.writeElement(specDir, { id: 'filey', kind: 'component', title: 'Filey', anchor: 'lib/thing.mjs' });
    store.writeElement(specDir, { id: 'globby', kind: 'component', title: 'Globby', anchor: 'lib/**' });

    const byId = Object.fromEntries(store.readAll(specDir).elements.map((e) => [e.id, e]));

    assert.equal(byId.filey.granularity, 'component', 'a file anchor resolves to component');
    assert.equal(byId.globby.granularity, 'subsystem', 'a glob anchor resolves to subsystem');
  });

  it('test_when_shard_exists_then_path_derives_by_convention', async () => {
    const shards = await tryImport(SHARDS);
    assert.ok(shards, `${SHARDS} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceShard(specDir, 'subject');

    const shard = shards.readShard(specDir, 'subject');

    assert.equal(shard.path, 'diagrams/subject.puml',
      'no stored field participates — the id alone determines the path');
  });

  it('test_when_anchor_digest_supplied_then_it_is_preserved', async () => {
    const store = await tryImport(STORE);
    assert.ok(store, `${STORE} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);

    store.writeElement(specDir, {
      id: 'subject', kind: 'component', title: 'Subject',
      anchor: 'lib/thing.mjs', anchor_digest: 'abc123def456',
    });

    assert.match(rawElement(specDir, 'subject'), /^anchor_digest: abc123def456$/m,
      'the digest is the one field that CANNOT be derived at read — it is the stored half of the comparison');
  });
});
