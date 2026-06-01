import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloneAndBuild } from './helpers/clone-and-build.mjs';

let manifest;
try {
  manifest = await import('../src/cli/manifest.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/manifest.js: ${err.message}`);
}

const { hashFile, buildManifestFromDir, saveManifest, loadManifest } = manifest;

// One shared clone+build for the read-only "built manifest shape" assertions
// below. Rebuilding per test was the dominant cost (each build rsyncs the tree
// and sha256-hashes ~260 files); both consumers only READ the built manifest,
// so a single cached build is safe.
let _builtPromise;
function sharedBuilt() {
  _builtPromise ??= cloneAndBuild('manifest-shared-');
  return _builtPromise;
}
after(async () => { if (_builtPromise) await rm(await _builtPromise, { recursive: true, force: true }); });

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

    assert.equal(result.manifest_version, 2);

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

describe('installed manifest v2 — baseline_version field (upgrade-flow-rework)', () => {
  it('test_when_manifest_v1_loaded_then_baseline_version_undefined', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-v1-back-'));
    const v1 = { manifest_version: 1, generated_at: '2025-01-01T00:00:00Z', files: { 'a.txt': 'a'.repeat(64) } };
    const p = join(dir, '.baseline-manifest.json');
    await writeFile(p, JSON.stringify(v1, null, 2) + '\n');

    const loaded = await loadManifest(p);

    assert.equal(loaded.manifest_version, 1);
    assert.equal(loaded.baseline_version, undefined,
      'legacy manifest_version:1 manifests have no baseline_version field — loader must not invent one');
  });

  it('test_when_buildManifestFromDir_called_then_manifest_version_is_2', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-v2-build-'));
    await writeFile(join(dir, 'a.txt'), 'hello');

    const result = await buildManifestFromDir(dir, ['a.txt']);

    assert.equal(result.manifest_version, 2,
      'buildManifestFromDir must emit MANIFEST_VERSION: 2 for the installed manifest shape post-rework');
  });

  it('test_when_buildManifestFromDir_called_with_baseline_version_arg_then_field_in_output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-v2-bv-'));
    await writeFile(join(dir, 'a.txt'), 'hello');

    const result = await buildManifestFromDir(dir, ['a.txt'], { baseline_version: '0.5.1' });

    assert.equal(result.baseline_version, '0.5.1',
      'buildManifestFromDir(dir, files, {baseline_version}) must surface baseline_version into the manifest');
  });
});

describe('manifest v2 shape (skill-ownership)', () => {
  it('test_when_manifest_built_then_v2_shape_has_owners_skills_present', async () => {
    const tmp = await sharedBuilt();
    // Shipped manifest now lives inside the .claude/ subtree so the recursive
    // install delivers it at <target>/.claude/manifest.json without special-
    // casing — see CLAUDE.md Article XI.
    const m = JSON.parse(await readFile(join(tmp, 'obj/template/.claude/manifest.json'), 'utf8'));
    assert.equal(m.manifest_version, 3, 'shipped manifest_version is 3 post-tier-classification rework');
    assert.ok(m.owners && typeof m.owners.skills === 'object', 'owners.skills must be an object');
    const slugs = Object.keys(m.owners.skills);
    assert.ok(slugs.length > 0, 'owners.skills must be non-empty');
    for (const s of slugs) assert.equal(m.owners.skills[s], 'baseline');
  });
});

// Spec AC-007 — docs/specs/upgrade-no-replay-prompts.md §Behavior #1
// After `npm run build` (or a direct invocation of scripts/build-manifest.mjs
// against obj/template/), the shipped manifest must declare runtime-state
// files as tier=NEVER_TOUCH. Their bodies are gitignored and rewritten every
// turn by memory hooks; merge-time tier dispatch on them is structurally wrong.
describe('shipped manifest — runtime-state file tier classification', () => {
  it('test_when_build_manifest_runs_then_pending_and_resume_tier_is_NEVER_TOUCH', async () => {
    // Build into a per-test tmpdir (not the live REPO_ROOT/obj/template, which
    // build-running tests rm -rf + rebuild — a parallel-run race). cloneAndBuild
    // serializes via the build script's TMPDIR-global mutex.
    const tmp = await sharedBuilt();
    const text = await readFile(join(tmp, 'obj/template/.claude/manifest.json'), 'utf8');
    const m = JSON.parse(text);

    const pendingEntry = m.files['.claude/memory/_pending.md'];
    assert.ok(pendingEntry, '.claude/memory/_pending.md must be present in manifest');
    assert.equal(
      pendingEntry.tier,
      'NEVER_TOUCH',
      `_pending.md tier must be NEVER_TOUCH (runtime-state file); got ${pendingEntry.tier}`,
    );

    const resumeEntry = m.files['.claude/memory/_resume.md'];
    assert.ok(resumeEntry, '.claude/memory/_resume.md must be present in manifest');
    assert.equal(
      resumeEntry.tier,
      'NEVER_TOUCH',
      `_resume.md tier must be NEVER_TOUCH (runtime-state file); got ${resumeEntry.tier}`,
    );
  });
});
