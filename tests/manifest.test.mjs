import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let manifest;
try {
  manifest = await import('../src/cli/manifest.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/manifest.js: ${err.message}`);
}

const { hashFile, buildManifestFromDir, saveManifest, loadManifest } = manifest;

describe('manifest module', () => {
  it('hashFile returns sha256 hex string of known content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
    const p = join(dir, 'fixture.txt');
    await writeFile(p, 'hello world');
    const result = await hashFile(p);
    assert.equal(result, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('hashFile produces consistent hashes across calls', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
    const p = join(dir, 'fixture.txt');
    await writeFile(p, 'consistent content');
    const first = await hashFile(p);
    const second = await hashFile(p);
    assert.equal(first, second);
  });

  it('buildManifestFromDir produces correct shape', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
    await writeFile(join(dir, 'a.txt'), 'file a');
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'b.txt'), 'file b');

    const result = await buildManifestFromDir(dir, ['a.txt', 'sub/b.txt']);

    assert.equal(result.manifest_version, 1);

    const parsed = new Date(result.generated_at);
    assert.ok(!isNaN(parsed.getTime()), `generated_at is not a valid date: ${result.generated_at}`);
    assert.equal(new Date(result.generated_at).toISOString(), result.generated_at);

    assert.ok(typeof result.files === 'object' && result.files !== null);
    assert.ok(Object.prototype.hasOwnProperty.call(result.files, 'a.txt'));
    assert.ok(Object.prototype.hasOwnProperty.call(result.files, 'sub/b.txt'));
    assert.equal(typeof result.files['a.txt'], 'string');
    assert.equal(result.files['a.txt'].length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(result.files['a.txt']));
    assert.equal(typeof result.files['sub/b.txt'], 'string');
    assert.equal(result.files['sub/b.txt'].length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(result.files['sub/b.txt']));
  });

  it('buildManifestFromDir is deterministic on file content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
    await writeFile(join(dir, 'a.txt'), 'file a');
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'b.txt'), 'file b');

    const first = await buildManifestFromDir(dir, ['a.txt', 'sub/b.txt']);
    const second = await buildManifestFromDir(dir, ['a.txt', 'sub/b.txt']);

    assert.deepEqual(first.files, second.files);
  });

  it('saveManifest writes pretty-printed JSON parsable by loadManifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
    await writeFile(join(dir, 'a.txt'), 'round trip');
    const m = await buildManifestFromDir(dir, ['a.txt']);

    const manifestPath = join(dir, 'manifest.json');
    await saveManifest(manifestPath, m);
    const loaded = await loadManifest(manifestPath);

    assert.deepEqual(loaded, m);
  });

  it('loadManifest on missing file throws or returns null (pick one)', async () => {
    const result = await loadManifest('/nonexistent-path-that-cannot-exist/manifest.json');
    assert.equal(result, null);
  });

  it('loadManifest on malformed JSON throws', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
    const p = join(dir, 'bad.json');
    await writeFile(p, 'this is not json {{{');
    await assert.rejects(() => loadManifest(p));
  });
});

describe('manifest v2 shape (skill-ownership)', () => {
  it('test_when_manifest_built_then_v2_shape_has_owners_skills_present', async () => {
    const { spawnSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const { readFile, mkdtemp: mkd } = await import('node:fs/promises');
    const here = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(here, '..');
    const tmp = await mkd(join(tmpdir(), 'manifest-v2-'));
    const rsync = spawnSync('rsync', [
      '-a',
      '--exclude=node_modules',
      '--exclude=obj',
      '--exclude=.git',
      '--exclude=docs/archive',
      '--exclude=.playwright-mcp',
      `${repoRoot}/`,
      tmp,
    ], { encoding: 'utf8' });
    if (rsync.status !== 0) throw new Error(`rsync failed: ${rsync.stderr}`);
    const build = spawnSync('bash', [join(tmp, 'scripts/build-template.sh')], {
      env: { ...process.env, PKG_ROOT: tmp, CLAUDE_PROJECT_DIR: tmp },
      encoding: 'utf8',
    });
    if (build.status !== 0) {
      throw new Error(`build failed: ${build.stderr || build.stdout}`);
    }
    // Shipped manifest now lives inside the .claude/ subtree so the recursive
    // install delivers it at <target>/.claude/manifest.json without special-
    // casing — see CLAUDE.md Article XI.
    const m = JSON.parse(await readFile(join(tmp, 'obj/template/.claude/manifest.json'), 'utf8'));
    assert.equal(m.manifest_version, 2);
    assert.ok(m.owners && typeof m.owners.skills === 'object', 'owners.skills must be an object');
    const slugs = Object.keys(m.owners.skills);
    assert.ok(slugs.length > 0, 'owners.skills must be non-empty');
    for (const s of slugs) assert.equal(m.owners.skills[s], 'baseline');
  });
});
