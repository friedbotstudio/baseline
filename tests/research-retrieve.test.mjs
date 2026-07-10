// research-retrieve — Foundation layer (drives the prior-art retriever).
//
// Exercises .claude/skills/research/retrieve.mjs: a deterministic, stdlib-only
// retriever that scans docs/archive/**/{research,spec}.md + .claude/memory/
// {decisions,libraries}.md for term overlap, so /research retrieves prior art
// before deriving (Component 3, AC-006/007/009/010).
//
// RED until /implement creates retrieve.mjs (import fails until then).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const RETRIEVE_PATH = path.join(REPO_ROOT, '.claude/skills/research/retrieve.mjs');

let retrieve;
try {
  ({ retrieve } = await import(RETRIEVE_PATH));
} catch (err) {
  throw new Error(
    `Cannot import .claude/skills/research/retrieve.mjs (RED expected pre-/implement). Original: ${err.message}`
  );
}

function mkfixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retr-'));
  const write = (rel, body) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  };
  return { root, write };
}

describe('retrieve() — prior-art retrieval', () => {
  it('ranks by term overlap; hits carry matchedTerms (AC-006, AC-010)', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/foo/research.md', 'alpha beta gamma delta findings');
    write('.claude/memory/decisions.md', 'alpha only, no other overlap');

    const res = retrieve({ root, slug: 'x', terms: ['alpha', 'beta'] });
    assert.ok(Array.isArray(res.hits) && res.hits.length >= 2, 'expected >=2 hits');

    const top = res.hits[0];
    assert.ok(top.path.endsWith('research.md'), `top hit should be research.md, got ${top.path}`);
    assert.equal(typeof top.path, 'string');
    assert.equal(typeof top.score, 'number');
    assert.ok(Array.isArray(top.matchedTerms));
    assert.equal(typeof top.excerpt, 'string');
    assert.deepEqual([...top.matchedTerms].sort(), ['alpha', 'beta']);

    const decisionHit = res.hits.find((h) => h.path.endsWith('decisions.md'));
    assert.ok(decisionHit, 'decisions.md should be a hit (matches alpha)');
    assert.ok(top.score > decisionHit.score, 'research.md (2 terms) must outrank decisions.md (1 term)');
  });

  it('empty corpus → no hits, no throw (AC-009)', () => {
    const { root } = mkfixture();
    let res;
    assert.doesNotThrow(() => { res = retrieve({ root, slug: 'x', terms: ['alpha'] }); });
    assert.ok(Array.isArray(res.hits) && res.hits.length === 0);
  });

  it('missing corpus dirs tolerated (AC-009)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retr-bare-'));
    let res;
    assert.doesNotThrow(() => { res = retrieve({ root, slug: 'x', terms: ['alpha', 'beta'] }); });
    assert.deepEqual(res.hits, []);
  });

  it('empty terms → hits empty, deterministic (AC-009, AC-010)', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/foo/research.md', 'alpha beta gamma');
    const res = retrieve({ root, slug: 'x', terms: [] });
    assert.deepEqual(res.hits, []);
  });

  it('determinism + stable sort by (score desc, path asc) (AC-010)', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/aaa/research.md', 'alpha beta');
    write('docs/archive/2020-01-01/bbb/spec.md', 'alpha beta');
    write('.claude/memory/libraries.md', 'alpha');

    const a = retrieve({ root, slug: 'x', terms: ['alpha', 'beta'] });
    const b = retrieve({ root, slug: 'x', terms: ['alpha', 'beta'] });
    assert.deepStrictEqual(a, b);

    for (let i = 1; i < a.hits.length; i++) {
      const prev = a.hits[i - 1];
      const cur = a.hits[i];
      const ordered = prev.score > cur.score || (prev.score === cur.score && prev.path <= cur.path);
      assert.ok(ordered, `hits not sorted at ${i}: ${prev.path}(${prev.score}) before ${cur.path}(${cur.score})`);
    }
  });
});

describe('retrieve CLI', () => {
  it('exits 0 and prints JSON with a hits array (AC-006)', () => {
    const { root, write } = mkfixture();
    write('docs/archive/2020-01-01/foo/research.md', 'alpha beta gamma');
    let stdout;
    try {
      stdout = execFileSync('node', [
        RETRIEVE_PATH, '--slug', 'x', '--terms', 'alpha beta', '--root', root,
      ], { encoding: 'utf8' });
    } catch (err) {
      assert.fail(`CLI exited non-zero: ${err.status}\nstderr: ${err.stderr}`);
    }
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed.hits), 'stdout JSON must carry a hits array');
  });
});
