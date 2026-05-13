import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let conflict;
try {
  conflict = await import('../src/cli/conflict.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/conflict.js: ${err.message}`);
}

const { scanSentinels } = conflict;

describe('conflict module', () => {
  it('scanSentinels on empty dir returns empty array', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'conflict-test-'));
    try {
      const result = await scanSentinels(dir);
      assert.deepEqual(result, []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scanSentinels on dir with only CLAUDE.md returns ['CLAUDE.md']", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'conflict-test-'));
    try {
      await writeFile(join(dir, 'CLAUDE.md'), '');
      const result = await scanSentinels(dir);
      assert.deepEqual(result, ['CLAUDE.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scanSentinels on dir with .mcp.json returns ['.mcp.json']", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'conflict-test-'));
    try {
      await writeFile(join(dir, '.mcp.json'), '{}');
      const result = await scanSentinels(dir);
      assert.deepEqual(result, ['.mcp.json']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scanSentinels on dir with .claude/ subdir returns ['.claude']", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'conflict-test-'));
    try {
      await mkdir(join(dir, '.claude'));
      const result = await scanSentinels(dir);
      assert.deepEqual(result, ['.claude']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scanSentinels on dir with docs/init/seed.md returns ['docs/init/seed.md']", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'conflict-test-'));
    try {
      await mkdir(join(dir, 'docs', 'init'), { recursive: true });
      await writeFile(join(dir, 'docs', 'init', 'seed.md'), '');
      const result = await scanSentinels(dir);
      assert.deepEqual(result, ['docs/init/seed.md']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('scanSentinels on dir with all sentinels returns all of them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'conflict-test-'));
    try {
      await mkdir(join(dir, '.claude'));
      await writeFile(join(dir, '.claude/.baseline-manifest.json'), '{}');
      await writeFile(join(dir, 'CLAUDE.md'), '');
      await writeFile(join(dir, '.mcp.json'), '{}');
      await mkdir(join(dir, 'docs', 'init'), { recursive: true });
      await writeFile(join(dir, 'docs', 'init', 'seed.md'), '');
      const result = await scanSentinels(dir);
      assert.equal(result.length, 5);
      for (const p of ['.claude', '.claude/.baseline-manifest.json', 'CLAUDE.md', '.mcp.json', 'docs/init/seed.md']) {
        assert.ok(result.includes(p), `expected '${p}' in result: ${JSON.stringify(result)}`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scanSentinels detects .claude/.baseline-manifest.json as a strong previously-installed signal", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'conflict-test-'));
    try {
      await mkdir(join(dir, '.claude'));
      await writeFile(join(dir, '.claude/.baseline-manifest.json'), '{"manifest_version":1}');
      const result = await scanSentinels(dir);
      assert.ok(result.includes('.claude/.baseline-manifest.json'));
      assert.ok(result.includes('.claude'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('scanSentinels handles a missing target dir without throwing', async () => {
    const result = await scanSentinels('/nonexistent/path-that-cannot-exist-conflict-test');
    assert.deepEqual(result, []);
  });
});
