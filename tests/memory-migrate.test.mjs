// Scenarios for the migrator — AC-005 (lossless forward, fidelity gate, reverse
// round-trip) and the CWE-22 key-rejection boundary. Covers §Behavior #5. Fails
// RED until migrate.mjs lands.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const MIGRATE = pathToFileURL(join(REPO_ROOT, '.claude/skills/memory-index/migrate.mjs')).href;

function seedFlat(root, name, blocks) {
  mkdirSync(join(root, '.claude/memory'), { recursive: true });
  const body = blocks
    .map((k) => `## ${k}\n\n> verbatim (user, 2026-07-10):\n> keeps repeating for ${k}\n\n- source: incident\n- verified-at: abc1234\n- last-touched: 2026-07-17\n`)
    .join('\n');
  writeFileSync(join(root, '.claude/memory', `${name}.md`),
    `---\nowners: [security]\nsize-cap: 500\n---\n\n${body}`);
}

describe('migrate — lossless forward (AC-005)', () => {
  it('test_when_migrate_forward_then_files_equal_blocks', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mem-mig-fwd-'));
    try {
      seedFlat(root, 'landmines', ['alpha-x', 'beta-y', 'gamma-z']);
      const { migrateForward } = await import(MIGRATE);
      const report = migrateForward(join(root, '.claude/memory'));
      const files = readdirSync(join(root, '.claude/memory/landmines')).filter((f) => f.endsWith('.md'));
      assert.equal(files.length, 3, 'block count == file count');
      assert.equal(report.perCategory.landmines.blocks, 3);
      assert.equal(report.perCategory.landmines.files, 3);
      assert.equal(report.dropped, 0, 'zero dropped');
      const alpha = readFileSync(join(root, '.claude/memory/landmines/alpha-x.md'), 'utf8');
      assert.match(alpha, /keeps repeating for alpha-x/, 'verbatim preserved through migration');
      assert.ok(!existsSync(join(root, '.claude/memory/landmines.md')), 'source file removed only after fidelity passed');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_migrate_count_mismatch_then_throws_before_removal', async () => {
    const { verifyMigrationFidelity, MigrationFidelityError } = await import(MIGRATE);
    assert.throws(
      () => verifyMigrationFidelity({ landmines: { blocks: 3, files: 2 } }),
      (err) => err instanceof MigrationFidelityError && /landmines/.test(err.message),
      'a block/file mismatch throws a named error (exit 1 path) — no silent data loss',
    );
    assert.doesNotThrow(() => verifyMigrationFidelity({ landmines: { blocks: 3, files: 3 } }));
  });

  it('test_when_reverse_migration_then_files_reconstructed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mem-mig-rev-'));
    try {
      seedFlat(root, 'landmines', ['alpha-x', 'beta-y', 'gamma-z']);
      const { migrateForward, migrateReverse } = await import(MIGRATE);
      const memRoot = join(root, '.claude/memory');
      migrateForward(memRoot);
      migrateReverse(memRoot);
      assert.ok(existsSync(join(memRoot, 'landmines.md')), 'reverse rebuilds the flat file');
      assert.ok(!existsSync(join(memRoot, 'landmines')), 'reverse removes the category dir');
      const rebuilt = readFileSync(join(memRoot, 'landmines.md'), 'utf8');
      for (const k of ['alpha-x', 'beta-y', 'gamma-z']) {
        assert.match(rebuilt, new RegExp(`## ${k}`), `reverse restores block ${k}`);
      }
      const order = ['alpha-x', 'beta-y', 'gamma-z'].map((k) => rebuilt.indexOf(`## ${k}`));
      assert.ok(order[0] < order[1] && order[1] < order[2], 'reverse is key-sorted (deterministic)');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('migrate — heading-preserving keys + scope backfill (AC-005 fidelity)', () => {
  it('test_when_heading_is_path_line_then_key_preserved_verbatim', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mem-mig-key-'));
    try {
      mkdirSync(join(root, '.claude/memory'), { recursive: true });
      // Real stable keys: path:line (landmarks) and a description slug — both would
      // be MANGLED by a slugify-the-key migrator. They must survive verbatim.
      writeFileSync(join(root, '.claude/memory/landmines.md'),
        `---\nowners: [security]\nsize-cap: 500\n---\n\n## .claude/hooks/foo.mjs:42\n\n> verbatim (incident, 2026-07-01):\n> do not edit X without Y\n\n- source: incident\n- last-touched: 2026-07-01\n`);
      const { migrateForward, migrateReverse } = await import(MIGRATE);
      const memRoot = join(root, '.claude/memory');
      migrateForward(memRoot);
      const files = readdirSync(join(memRoot, 'landmines')).filter((f) => f.endsWith('.md'));
      assert.equal(files.length, 1);
      const { parseFrontmatter } = await import(pathToFileURL(join(REPO_ROOT, '.claude/hooks/lib/frontmatter-parser.mjs')).href);
      const parsed = parseFrontmatter(readFileSync(join(memRoot, 'landmines', files[0]), 'utf8'));
      assert.equal(parsed.frontmatter.key, '.claude/hooks/foo.mjs:42', 'stable key preserved verbatim (NOT slugified)');
      assert.match(String(parsed.frontmatter.scope), /spec/, 'landmines scope backfilled to include spec (AC-003 activation)');
      assert.ok(/^[a-z0-9][a-z0-9-]*\.md$/.test(files[0]), `filename is a safe slug: ${files[0]}`);
      migrateReverse(memRoot);
      const rebuilt = readFileSync(join(memRoot, 'landmines.md'), 'utf8');
      assert.match(rebuilt, /## \.claude\/hooks\/foo\.mjs:42/, 'reverse reconstructs the original path:line heading');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('migrate — fact-key rejection (CWE-22 boundary)', () => {
  it('test_when_key_has_traversal_then_rejected', async () => {
    const { assertSafeFactKey } = await import(MIGRATE);
    for (const bad of ['../etc/passwd', 'a/b', 'foo\\bar', '..', '/abs', 'has space']) {
      assert.throws(() => assertSafeFactKey(bad), /key/i, `must REJECT unsafe key ${JSON.stringify(bad)}`);
    }
    assert.equal(assertSafeFactKey('valid-fact-key-123'), 'valid-fact-key-123', 'a safe key passes through unchanged (REJECT, never normalize)');
  });
});
