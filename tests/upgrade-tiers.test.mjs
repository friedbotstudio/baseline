// Tests for src/cli/upgrade-tiers.js — tier dispatch + BASE resolver +
// stage I/O for the three-tier upgrade flow rework. RED until the module
// exists. See docs/specs/upgrade-flow-rework.md §Behavior #2 / #3 / #4 / #5 / #6.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

let tiers;
try {
  tiers = await import('../src/cli/upgrade-tiers.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/upgrade-tiers.js: ${err.message}`);
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function seedCache(target, rel, bytes) {
  const full = join(target, '.claude/.baseline-prior', rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, bytes);
}

async function seedLocal(target, rel, bytes) {
  const full = join(target, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, bytes);
}

describe('upgrade-tiers — resolveBase (BASE-content recovery)', () => {
  it('test_when_resolveBase_cache_hit_with_matching_sha_then_returns_bytes', async () => {
    const target = await mkdtemp(join(tmpdir(), 'tiers-cache-hit-'));
    const baseBytes = Buffer.from('# baseline v0.4.0 content\n');
    await seedCache(target, 'CLAUDE.md', baseBytes);
    const oldManifest = { manifest_version: 2, baseline_version: '0.4.0', files: { 'CLAUDE.md': sha256(baseBytes) } };

    const got = await tiers.resolveBase('CLAUDE.md', '0.4.0', target, { oldManifest });

    assert.ok(Buffer.isBuffer(got) || typeof got === 'string',
      'resolveBase must return Buffer or string of BASE bytes');
    assert.equal(Buffer.from(got).toString('utf8'), baseBytes.toString('utf8'));
  });

  it('test_when_resolveBase_cache_sha_mismatch_then_throws_NoBaseError_not_silent_fallthrough', async () => {
    const target = await mkdtemp(join(tmpdir(), 'tiers-cache-mismatch-'));
    await seedCache(target, 'CLAUDE.md', Buffer.from('tampered content\n'));
    const oldManifest = { manifest_version: 2, baseline_version: '0.4.0', files: { 'CLAUDE.md': 'a'.repeat(64) } };

    await assert.rejects(
      () => tiers.resolveBase('CLAUDE.md', '0.4.0', target, { oldManifest, pack: async () => { throw new Error('should not reach pack on tamper'); } }),
      (err) => err.name === 'NoBaseError' && /sha/i.test(err.message),
      'cache sha mismatch must throw NoBaseError naming the sha problem'
    );
  });

  it('test_when_resolveBase_cache_miss_npm_fallback_hit_then_returns_bytes_and_writes_through_cache', async () => {
    const target = await mkdtemp(join(tmpdir(), 'tiers-fallback-hit-'));
    const baseBytes = Buffer.from('# baseline v0.4.0 content\n');
    const oldManifest = { manifest_version: 2, baseline_version: '0.4.0', files: { 'CLAUDE.md': sha256(baseBytes) } };
    // pack stub returns a tarball-like structure the resolver can interpret;
    // for the test seam we return a Map of rel→Buffer that the resolver applies as a virtual tarball.
    const packStub = async (spec) => {
      assert.match(spec, /^@friedbotstudio\/create-baseline@0\.4\.0$/,
        `pack must be called with the recorded baseline_version; got ${spec}`);
      return new Map([['CLAUDE.md', baseBytes]]);
    };

    const got = await tiers.resolveBase('CLAUDE.md', '0.4.0', target, { oldManifest, pack: packStub });

    assert.equal(Buffer.from(got).toString('utf8'), baseBytes.toString('utf8'));
    // Write-through to cache so the next call short-circuits.
    const cached = await readFile(join(target, '.claude/.baseline-prior/CLAUDE.md'));
    assert.equal(cached.toString('utf8'), baseBytes.toString('utf8'),
      'cache miss + npm hit must write-through to .baseline-prior/<rel> for the next upgrade');
  });

  it('test_when_resolveBase_cache_miss_and_npm_unavailable_then_throws_NoBaseError', async () => {
    const target = await mkdtemp(join(tmpdir(), 'tiers-fallback-miss-'));
    const oldManifest = { manifest_version: 2, baseline_version: '0.4.0', files: { 'CLAUDE.md': 'b'.repeat(64) } };
    const packStub = async () => { throw new Error('ENOTFOUND registry.npmjs.org'); };

    await assert.rejects(
      () => tiers.resolveBase('CLAUDE.md', '0.4.0', target, { oldManifest, pack: packStub }),
      (err) => err.name === 'NoBaseError' && /npm|fetch|network/i.test(err.message),
      'cache miss + npm fail must throw NoBaseError naming the network problem'
    );
  });

  it('test_when_resolveBase_legacy_no_baseline_version_then_throws_NoBaseError_legacy_kind', async () => {
    const target = await mkdtemp(join(tmpdir(), 'tiers-legacy-'));
    const oldManifest = { manifest_version: 1, files: { 'CLAUDE.md': 'c'.repeat(64) } }; // no baseline_version

    await assert.rejects(
      () => tiers.resolveBase('CLAUDE.md', undefined, target, { oldManifest }),
      (err) => err.name === 'NoBaseError' && (err.kind === 'legacy_manifest' || /legacy/i.test(err.message)),
      'undefined baseline_version (legacy manifest_v1) must throw NoBaseError with kind/message naming the legacy case'
    );
  });
});

describe('upgrade-tiers — findPendingStage (idempotency precondition)', () => {
  it('test_when_findPendingStage_no_dir_then_returns_null', async () => {
    const target = await mkdtemp(join(tmpdir(), 'tiers-stage-empty-'));
    const got = await tiers.findPendingStage(target);
    assert.equal(got, null, 'no .claude/state/upgrade/ → no pending stage → null');
  });

  it('test_when_findPendingStage_with_pending_manifest_then_returns_stage_info', async () => {
    const target = await mkdtemp(join(tmpdir(), 'tiers-stage-pending-'));
    const stageTs = '2026-05-20T14-49-00Z';
    const stageDir = join(target, '.claude/state/upgrade', stageTs);
    await mkdir(stageDir, { recursive: true });
    await writeFile(join(stageDir, 'manifest.json'), JSON.stringify({
      stage_version: 1,
      slug: 'upgrade-flow-rework',
      created_at: new Date().toISOString(),
      baseline_version_from: '0.4.0',
      baseline_version_to: '0.5.0',
      files: [{ rel: 'docs/init/seed.md', base_sha256: 'a'.repeat(64), incoming_sha256: 'b'.repeat(64), local_sha256: 'c'.repeat(64), status: 'PENDING' }],
    }, null, 2));

    const got = await tiers.findPendingStage(target);

    assert.ok(got && typeof got === 'object', 'pending stage → object');
    assert.equal(got.stage_ts, stageTs);
    assert.deepEqual(got.files, ['docs/init/seed.md']);
  });

  it('test_when_findPendingStage_with_all_RECONCILED_then_returns_null', async () => {
    const target = await mkdtemp(join(tmpdir(), 'tiers-stage-done-'));
    const stageDir = join(target, '.claude/state/upgrade/2026-05-20T15-00-00Z');
    await mkdir(stageDir, { recursive: true });
    await writeFile(join(stageDir, 'manifest.json'), JSON.stringify({
      stage_version: 1, slug: 'x', created_at: 'x', baseline_version_from: '0.4.0', baseline_version_to: '0.5.0',
      files: [{ rel: 'a.md', base_sha256: 'a'.repeat(64), incoming_sha256: 'b'.repeat(64), local_sha256: 'c'.repeat(64), status: 'RECONCILED' }],
    }, null, 2));

    const got = await tiers.findPendingStage(target);

    assert.equal(got, null,
      'a stage with all entries RECONCILED is logically empty — findPendingStage must return null so the CLI does not re-print the pointer');
  });
});

describe('upgrade-tiers — dispatchByTier', () => {
  it('test_when_dispatchByTier_BINARY_PROMPT_then_returns_SKIP_CUSTOMIZED', async () => {
    const ctx = makeCtx();
    const action = await tiers.dispatchByTier('CLAUDE.md', 'BINARY_PROMPT', ctx);
    assert.equal(action.kind, 'SKIP_CUSTOMIZED', 'BINARY_PROMPT tier → SKIP_CUSTOMIZED action (same as today)');
  });

  it('test_when_dispatchByTier_MECHANICAL_and_git_merge_clean_then_returns_MECHANICAL_MERGE_CLEAN', async () => {
    const { target, ctx, rel } = await seedMechanicalNonOverlapping();
    const action = await tiers.dispatchByTier(rel, 'MECHANICAL', ctx);
    assert.equal(action.kind, 'MECHANICAL_MERGE_CLEAN');
    const merged = await readFile(join(target, rel), 'utf8');
    assert.ok(/local addition/.test(merged) && /incoming addition/.test(merged),
      'clean 3-way merge must keep BOTH the local-only addition AND the incoming-only addition');
  });

  it('test_when_dispatchByTier_MECHANICAL_and_git_merge_conflicts_then_returns_MECHANICAL_MERGE_CONFLICTED', async () => {
    const { target, ctx, rel } = await seedMechanicalOverlapping();
    const action = await tiers.dispatchByTier(rel, 'MECHANICAL', ctx);
    assert.equal(action.kind, 'MECHANICAL_MERGE_CONFLICTED');
    assert.ok(typeof action.hunks === 'number' && action.hunks >= 1, 'must report hunk count');
    const onDisk = await readFile(join(target, rel), 'utf8');
    assert.ok(/<<<<<<</.test(onDisk) && />>>>>>>/.test(onDisk),
      'overlapping merge must leave conflict markers in LOCAL on disk');
  });

  it('test_when_dispatchByTier_SEMANTIC_then_writes_stage_and_returns_SEMANTIC_MERGE_STAGED', async () => {
    const { target, ctx, rel, localBytes } = await seedSemanticBoth();
    const action = await tiers.dispatchByTier(rel, 'SEMANTIC', ctx);
    assert.equal(action.kind, 'SEMANTIC_MERGE_STAGED');

    // LOCAL untouched.
    const after = await readFile(join(target, rel), 'utf8');
    assert.equal(after, localBytes.toString('utf8'), 'LOCAL must be untouched after SEMANTIC staging');

    // Stage dir exists with both artifacts + manifest.
    const stageRoot = join(target, '.claude/state/upgrade');
    const stages = await readdir(stageRoot);
    assert.equal(stages.length, 1, 'exactly one stage_ts dir per run');
    const stageDir = join(stageRoot, stages[0]);
    await access(join(stageDir, `${rel}.baseline-base`));
    await access(join(stageDir, `${rel}.baseline-incoming`));
    const m = JSON.parse(await readFile(join(stageDir, 'manifest.json'), 'utf8'));
    assert.equal(m.files.length, 1);
    assert.equal(m.files[0].rel, rel);
    assert.equal(m.files[0].status, 'PENDING');
  });

  it('test_when_dispatchByTier_SEMANTIC_called_twice_for_same_file_in_same_run_then_appends_to_existing_stage', async () => {
    const { target, ctx, rel } = await seedSemanticBoth();
    const { rel: rel2 } = await seedSemanticBoth({ rel: 'CLAUDE.md', existingTarget: target, existingCtx: ctx });

    await tiers.dispatchByTier(rel, 'SEMANTIC', ctx);
    await tiers.dispatchByTier(rel2, 'SEMANTIC', ctx);

    const stages = await readdir(join(target, '.claude/state/upgrade'));
    assert.equal(stages.length, 1, 'both dispatches in same run must share one stage_ts dir');
    const m = JSON.parse(await readFile(join(target, '.claude/state/upgrade', stages[0], 'manifest.json'), 'utf8'));
    assert.equal(m.files.length, 2, 'stage manifest must contain both staged files');
  });
});

// --- helpers (Foundation) ---

function makeCtx({ baseline_version = '0.4.0' } = {}) {
  return {
    target: '/dev/null',
    templateDir: '/dev/null',
    oldManifest: { manifest_version: 2, baseline_version, files: {} },
    newManifest: { manifest_version: 3, files: {} },
    baseline_version,
    stageRunTs: null,
  };
}

async function seedMechanicalNonOverlapping() {
  const target = await mkdtemp(join(tmpdir(), 'tiers-mech-clean-'));
  const rel = 'docs/notes.md';
  const base = '# line A\n# line B\n# line C\n';
  const local = '# line A\n# line B\n# line C\n# local addition\n';
  const incoming = '# line A header\n# line B\n# line C\n';
  await seedLocal(target, rel, local);
  const baseBuf = Buffer.from(base);
  await seedCache(target, rel, baseBuf);

  // ensure BOTH sides have an addition the other side doesn't, in non-overlapping regions
  const localBytes = '# line A\n# line B\n# line C\n# local addition\n';
  const incomingBytes = '# line A header (incoming addition)\n# line B\n# line C\n';
  await writeFile(join(target, rel), localBytes);

  const ctx = {
    target,
    templateDir: await makeTplDirWith(rel, incomingBytes),
    oldManifest: { manifest_version: 2, baseline_version: '0.4.0', files: { [rel]: sha256(baseBuf) } },
    newManifest: { manifest_version: 3, files: { [rel]: { sha256: sha256(Buffer.from(incomingBytes)), tier: 'MECHANICAL' } } },
    baseline_version: '0.4.0',
    stageRunTs: null,
  };
  return { target, ctx, rel };
}

async function seedMechanicalOverlapping() {
  const target = await mkdtemp(join(tmpdir(), 'tiers-mech-conflict-'));
  const rel = 'docs/notes.md';
  const base = '# line A\n# line B\n# line C\n';
  const local = '# line A LOCAL EDIT\n# line B\n# line C\n';
  const incoming = '# line A INCOMING EDIT\n# line B\n# line C\n';
  await seedLocal(target, rel, local);
  const baseBuf = Buffer.from(base);
  await seedCache(target, rel, baseBuf);

  const ctx = {
    target,
    templateDir: await makeTplDirWith(rel, incoming),
    oldManifest: { manifest_version: 2, baseline_version: '0.4.0', files: { [rel]: sha256(baseBuf) } },
    newManifest: { manifest_version: 3, files: { [rel]: { sha256: sha256(Buffer.from(incoming)), tier: 'MECHANICAL' } } },
    baseline_version: '0.4.0',
    stageRunTs: null,
  };
  return { target, ctx, rel };
}

async function seedSemanticBoth({ rel = 'docs/init/seed.md', existingTarget = null, existingCtx = null } = {}) {
  const target = existingTarget ?? await mkdtemp(join(tmpdir(), 'tiers-sem-'));
  const baseBytes = Buffer.from('# seed v1\n## Article X\nbody\n');
  const localBytes = Buffer.from('# seed v1\n## Article X\nbody\n## Article XI (user)\nuser added this\n');
  const incomingBytes = Buffer.from('# seed v1\n## Article X\nbody\n## Article XI (baseline)\nbaseline added this\n');
  await seedLocal(target, rel, localBytes);
  await seedCache(target, rel, baseBytes);

  const ctx = existingCtx ?? {
    target,
    templateDir: await makeTplDirWith(rel, incomingBytes),
    oldManifest: { manifest_version: 2, baseline_version: '0.4.0', files: {} },
    newManifest: { manifest_version: 3, files: {} },
    baseline_version: '0.4.0',
    stageRunTs: null,
  };
  ctx.oldManifest.files[rel] = sha256(baseBytes);
  ctx.newManifest.files[rel] = { sha256: sha256(incomingBytes), tier: 'SEMANTIC' };
  if (!existingCtx) ctx.templateDir = await makeTplDirWith(rel, incomingBytes);
  else await writeIncomingInto(ctx.templateDir, rel, incomingBytes);

  return { target, ctx, rel, localBytes };
}

async function makeTplDirWith(rel, bytes) {
  const dir = await mkdtemp(join(tmpdir(), 'tiers-tpl-'));
  const full = join(dir, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, bytes);
  return dir;
}

async function writeIncomingInto(dir, rel, bytes) {
  const full = join(dir, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, bytes);
}
