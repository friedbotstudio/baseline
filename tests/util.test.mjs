import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const util = await import('../src/cli/util.js');

describe('pathExists', () => {
  it('returns true for an existing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'util-test-'));
    const p = join(dir, 'a.txt');
    await writeFile(p, '');
    try {
      assert.equal(await util.pathExists(p), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns true for an existing directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'util-test-'));
    try {
      assert.equal(await util.pathExists(dir), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns false for a missing path', async () => {
    assert.equal(await util.pathExists('/nonexistent/path-util-test'), false);
  });
});
