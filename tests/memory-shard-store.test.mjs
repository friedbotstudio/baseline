// Scenarios for the sharded (one-fact-per-file) store — AC-001, AC-004, and the
// closure-field regression. Covers docs/specs/memory-decision-point-redesign.md
// §Behavior #1 and #4. Modules under test do not exist yet: these fail RED until
// the implement worker lands them.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const MIGRATE = pathToFileURL(join(REPO_ROOT, '.claude/skills/memory-index/migrate.mjs')).href;
const BUILD_INDEX = pathToFileURL(join(REPO_ROOT, '.claude/skills/memory-index/build-index.mjs')).href;
const PARSER = pathToFileURL(join(REPO_ROOT, '.claude/hooks/lib/frontmatter-parser.mjs')).href;

function factFile(key, extra = '') {
  return `---
key: ${key}
category: landmines
scope: [spec]
source: incident
verified-at: abc1234
last-touched: 2026-07-17
${extra}---

> verbatim (user, 2026-07-10):
> the pattern keeps repeating

Interpretation body for ${key}.
`;
}

function seedShardedRoot(factCount = 1) {
  const root = mkdtempSync(join(tmpdir(), 'mem-shard-'));
  const cat = join(root, '.claude/memory/landmines');
  mkdirSync(cat, { recursive: true });
  for (let i = 0; i < factCount; i++) {
    writeFileSync(join(cat, `fact-${i}.md`), factFile(`fact-${i}`));
  }
  return root;
}

function seedFlatLandmines(root, blocks) {
  const body = blocks
    .map((k) => `## ${k}\n\n> verbatim (user, 2026-07-10):\n> keeps repeating\n\n- source: incident\n- verified-at: abc1234\n- last-touched: 2026-07-17\n`)
    .join('\n');
  writeFileSync(join(root, '.claude/memory/landmines.md'),
    `---\nowners: [security]\nsize-cap: 500\n---\n\n${body}`);
}

describe('sharded store — one fact per file (AC-001)', () => {
  it('test_when_fact_promoted_then_single_file_written', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mem-shard-a1-'));
    try {
      mkdirSync(join(root, '.claude/memory'), { recursive: true });
      seedFlatLandmines(root, ['alpha-gotcha', 'beta-gotcha', 'gamma-gotcha']);
      const { migrateForward } = await import(MIGRATE);
      const report = migrateForward(join(root, '.claude/memory'));
      const files = readdirSync(join(root, '.claude/memory/landmines')).filter((f) => f.endsWith('.md'));
      assert.equal(files.length, 3, 'three blocks -> three fact files');
      const { parseFrontmatter } = await import(PARSER);
      for (const f of files) {
        const text = await import('node:fs').then((m) => m.readFileSync(join(root, '.claude/memory/landmines', f), 'utf8'));
        const { frontmatter, body } = parseFrontmatter(text);
        assert.ok(frontmatter.key, 'each fact file carries a key');
        assert.doesNotMatch(body, /^## /m, 'a fact file holds exactly one fact — no second ## heading');
      }
      assert.equal(report.perCategory.landmines.blocks, report.perCategory.landmines.files);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('sharded store — growth never evicts (AC-004)', () => {
  it('test_when_category_grows_then_no_fact_evicted', async () => {
    const root = seedShardedRoot(20);
    try {
      const { buildIndex } = await import(BUILD_INDEX);
      const before = buildIndex(join(root, '.claude/memory'));
      assert.equal(before.entries.length, 20);
      writeFileSync(join(root, '.claude/memory/landmines/fact-20.md'), factFile('fact-20'));
      const after = buildIndex(join(root, '.claude/memory'));
      assert.equal(after.entries.length, 21, 'adding a fact never removes an existing one — no cap eviction');
      const files = readdirSync(join(root, '.claude/memory/landmines')).filter((f) => f.endsWith('.md'));
      assert.equal(files.length, 21);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('sharded store — closure fields survive (regression)', () => {
  it('test_when_closure_field_on_fact_file_then_autoclosed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mem-shard-close-'));
    try {
      const cat = join(root, '.claude/memory/landmines');
      mkdirSync(cat, { recursive: true });
      writeFileSync(join(cat, 'open.md'), factFile('open'));
      writeFileSync(join(cat, 'closed.md'), factFile('closed', 'superseded-at: 2026-07-01\n'));
      const { factIsClosed } = await import(BUILD_INDEX);
      const { parseFrontmatter } = await import(PARSER);
      const fs = await import('node:fs');
      assert.equal(factIsClosed(parseFrontmatter(fs.readFileSync(join(cat, 'closed.md'), 'utf8')).frontmatter), true);
      assert.equal(factIsClosed(parseFrontmatter(fs.readFileSync(join(cat, 'open.md'), 'utf8')).frontmatter), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
