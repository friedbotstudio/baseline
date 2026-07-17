// Scenarios for the graph index builder — AC-002 (index carries frontmatter, not
// bodies) and AC-008 (wikilink edges resolve to fact files). Covers §Behavior #2
// and #8. Fails RED until build-index.mjs lands.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const BUILD_INDEX = pathToFileURL(join(REPO_ROOT, '.claude/skills/memory-index/build-index.mjs')).href;

const SECRET_BODY = 'SECRET_BODY_SENTINEL_should_not_appear_in_index';

function fact(key, category, { scope = [], links = [] } = {}) {
  const l = links.length ? `links: [${links.join(', ')}]\n` : '';
  const s = scope.length ? `scope: [${scope.join(', ')}]\n` : '';
  return `---
key: ${key}
category: ${category}
${s}${l}source: inferred-from-code
verified-at: abc1234
last-touched: 2026-07-17
---

One-line hook for ${key}.

${SECRET_BODY} — the long body that must stay out of the injected index.
`;
}

function seedGraph() {
  const root = mkdtempSync(join(tmpdir(), 'mem-index-'));
  const lm = join(root, '.claude/memory/landmines');
  const dec = join(root, '.claude/memory/decisions');
  mkdirSync(lm, { recursive: true });
  mkdirSync(dec, { recursive: true });
  writeFileSync(join(lm, 'outcome-ac.md'), fact('outcome-ac', 'landmines', { scope: ['spec'], links: ['decisions/drift-oracle'] }));
  writeFileSync(join(dec, 'drift-oracle.md'), fact('drift-oracle', 'decisions', { scope: ['spec'] }));
  return root;
}

describe('build-index — index not bodies (AC-002)', () => {
  it('test_when_session_start_on_sharded_store_then_index_not_bodies', async () => {
    const root = seedGraph();
    try {
      const { buildIndex } = await import(BUILD_INDEX);
      const idx = buildIndex(join(root, '.claude/memory'));
      assert.ok(Array.isArray(idx.entries) && idx.entries.length === 2, 'two facts -> two index entries');
      const payload = JSON.stringify(idx);
      assert.doesNotMatch(payload, new RegExp(SECRET_BODY), 'entry BODIES must not appear in the index payload');
      const e = idx.entries.find((x) => x.key === 'outcome-ac');
      assert.deepEqual(e.scope, ['spec'], 'index carries the scope tag');
      assert.match(e.hook, /One-line hook/, 'index carries the one-line hook, not the full body');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('build-index — wikilink edges resolve (AC-008)', () => {
  it('test_when_wikilink_followed_then_resolves_to_fact_file', async () => {
    const root = seedGraph();
    try {
      const { buildIndex } = await import(BUILD_INDEX);
      const idx = buildIndex(join(root, '.claude/memory'));
      const edge = idx.edges.find((x) => x.from === 'landmines/outcome-ac' && x.to === 'decisions/drift-oracle');
      assert.ok(edge, 'the [[decisions/drift-oracle]] link becomes a graph edge');
      const target = join(root, '.claude/memory', `${edge.to}.md`);
      assert.ok(existsSync(target), 'the edge target resolves to an existing fact file (navigable)');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
