// Domain — tier dispatch + BASE-content recovery + semantic-merge staging.
// Consumed by src/cli/merge.js's customized-file branch. See
// docs/specs/upgrade-flow-rework.md §Behavior #2/#3/#4/#5/#6.

import { mkdir, mkdtemp, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

export class NoBaseError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'NoBaseError';
    this.kind = opts.kind ?? 'unknown';
    this.rel = opts.rel ?? null;
    if (opts.cause) this.cause = opts.cause;
  }
}

export async function resolveBase(rel, baseline_version, target, opts = {}) {
  const { oldManifest = null, pack = null } = opts;
  const expectedSha = readExpectedSha(oldManifest, rel);
  const cached = await readCacheIfPresent(target, rel);
  if (cached) {
    if (expectedSha && sha256(cached) === expectedSha) return cached;
    if (expectedSha) {
      throw new NoBaseError(`cache sha mismatch for ${rel}`, { kind: 'cache_sha_mismatch', rel });
    }
    return cached;
  }
  if (!baseline_version) {
    throw new NoBaseError(`legacy manifest; cannot recover BASE for ${rel}`, { kind: 'legacy_manifest', rel });
  }
  const fetched = await fetchFromNpm(rel, baseline_version, pack);
  if (expectedSha && sha256(fetched) !== expectedSha) {
    throw new NoBaseError(`npm tarball sha mismatch for ${rel}`, { kind: 'npm_sha_mismatch', rel });
  }
  await writeCacheThrough(target, rel, fetched);
  return fetched;
}

// Returns true when resolveBase would succeed for this file without throwing
// NoBaseError. Used by merge.js:dispatchCustomized in dry-run mode so the TUI
// surfaces files whose BASE is unrecoverable as conflicts (and prompts the
// user) instead of optimistically classifying them as tier-2/3 merge candidates
// that will silently fall back to keep-mine at real-run time.
export function canRecoverBase(rel, baseline_version, target) {
  const cachePath = join(target, '.claude/.baseline-prior', rel);
  if (existsSync(cachePath)) return true;
  return Boolean(baseline_version);
}

// Render a stage_ts (the `stageTimestamp` format: ISO 8601 with every `:` and
// `.` replaced by `-`, e.g. "2026-05-20T14-49-00-000Z") as a human-readable
// "YYYY-MM-DD HH:MM UTC". Returns the input unchanged when the pattern doesn't
// match so we never silently corrupt an unexpected value.
export function formatStageTimestamp(ts) {
  if (typeof ts !== 'string') return String(ts);
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-\d{2}-\d{3}Z$/);
  if (!m) return ts;
  return `${m[1]} ${m[2]}:${m[3]} UTC`;
}

export async function findPendingStage(target) {
  const stageRoot = join(target, '.claude/state/upgrade');
  if (!existsSync(stageRoot)) return null;
  const stages = await listSubdirs(stageRoot);
  for (const ts of stages) {
    const manifestPath = join(stageRoot, ts, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const pending = await readPendingFiles(manifestPath);
    if (pending.length > 0) return { stage_ts: ts, files: pending };
  }
  return null;
}

export async function dispatchByTier(rel, tier, ctx) {
  if (tier === 'BINARY_PROMPT') {
    return { kind: 'SKIP_CUSTOMIZED', path: rel, reason: 'tier BINARY_PROMPT: user prompt deferred' };
  }
  if (tier === 'MECHANICAL') return runMechanicalMerge(rel, ctx);
  if (tier === 'SEMANTIC') return runSemanticStage(rel, ctx);
  throw new Error(`unknown tier: ${tier}`);
}

export async function writeStage(ctx, rel, baseBuf, incomingBuf, localBuf) {
  const stageDir = await ensureStageDir(ctx);
  await writeStageArtifact(stageDir, `${rel}.baseline-base`, baseBuf);
  await writeStageArtifact(stageDir, `${rel}.baseline-incoming`, incomingBuf);
  await appendToStageManifest(stageDir, ctx, rel, baseBuf, incomingBuf, localBuf);
}

// BASE-less stage writer used by the tier-1 Merge pick (see
// docs/specs/tier1-merge-option.md §Behavior #2 + design pick 1A). Unlike
// writeStage, no BASE artifact is written and the manifest entry carries
// base_sha256: null — the discriminator /upgrade-project reads to route to
// two-way reconciliation.
export async function writeStageBaseless(ctx, rel, incomingBuf, localBuf) {
  const stageDir = await ensureStageDir(ctx);
  await writeStageArtifact(stageDir, `${rel}.baseline-incoming`, incomingBuf);
  await appendToStageManifest(stageDir, ctx, rel, null, incomingBuf, localBuf);
}

async function ensureStageDir(ctx) {
  if (!ctx.stageRunTs) ctx.stageRunTs = stageTimestamp();
  const stageDir = join(ctx.target, '.claude/state/upgrade', ctx.stageRunTs);
  await mkdir(stageDir, { recursive: true });
  return stageDir;
}

// --- foundation helpers ---

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function readExpectedSha(oldManifest, rel) {
  const entry = oldManifest?.files?.[rel];
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && typeof entry.sha256 === 'string') return entry.sha256;
  return null;
}

async function readCacheIfPresent(target, rel) {
  const cachePath = join(target, '.claude/.baseline-prior', rel);
  if (!existsSync(cachePath)) return null;
  return await readFile(cachePath);
}

async function writeCacheThrough(target, rel, bytes) {
  const cachePath = join(target, '.claude/.baseline-prior', rel);
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, bytes);
}

async function fetchFromNpm(rel, baseline_version, packOverride) {
  const packFn = packOverride ?? defaultPack;
  const spec = `@friedbotstudio/create-baseline@${baseline_version}`;
  let result;
  try {
    result = await packFn(spec);
  } catch (err) {
    throw new NoBaseError(`npm fetch failed for ${rel}: ${err.message}`, {
      kind: 'npm_fetch_failed', rel, cause: err,
    });
  }
  const bytes = await extractFromPackResult(result, rel);
  if (!bytes) {
    throw new NoBaseError(`npm tarball missing ${rel}`, { kind: 'npm_missing_file', rel });
  }
  return bytes;
}

async function defaultPack(spec) {
  const mod = await import('libnpmpack');
  const fn = mod.default ?? mod.pack ?? mod;
  return fn(spec);
}

async function extractFromPackResult(result, rel) {
  if (result instanceof Map) return result.get(rel) ?? null;
  if (Buffer.isBuffer(result) || result instanceof Uint8Array) {
    return extractFromTarball(Buffer.from(result), rel);
  }
  throw new Error(`unsupported pack result type: ${typeof result}`);
}

async function extractFromTarball(tarballBytes, rel) {
  const tmp = await mkdtemp(join(tmpdir(), 'baseline-prior-extract-'));
  const tmpRoot = resolve(tmp) + sep;
  const result = spawnSync('tar', ['-xz', '-C', tmp, '-f', '-'], { input: tarballBytes });
  if (result.status !== 0) {
    throw new Error(`tar extract failed: ${(result.stderr || '').toString()}`);
  }
  const candidate = join(tmp, 'package', rel);
  // Defense in depth: although bsdtar (macOS default) and GNU tar both refuse
  // absolute paths and `..` components by default when extracting, validate
  // the candidate resolves under tmp before reading. Refuses to follow a
  // malicious tarball that somehow planted bytes outside the extraction root.
  const resolved = resolve(candidate);
  if (!resolved.startsWith(tmpRoot)) {
    throw new NoBaseError(`tarball entry escapes extraction root: ${rel}`, { kind: 'tarball_path_traversal', rel });
  }
  if (!existsSync(resolved)) return null;
  return await readFile(resolved);
}

async function listSubdirs(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function readPendingFiles(manifestPath) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    return (manifest.files || []).filter((f) => f.status === 'PENDING').map((f) => f.rel);
  } catch {
    return [];
  }
}

// --- domain helpers ---

async function runMechanicalMerge(rel, ctx) {
  const base = await resolveBase(rel, ctx.baseline_version, ctx.target, {
    oldManifest: ctx.oldManifest, pack: ctx.pack,
  });
  const remote = await readFile(join(ctx.templateDir, rel));
  const localPath = join(ctx.target, rel);
  const tmpBase = join(tmpdir(), `merge-base-${randomUUID()}`);
  const tmpRemote = join(tmpdir(), `merge-remote-${randomUUID()}`);
  await writeFile(tmpBase, base);
  await writeFile(tmpRemote, remote);
  const result = spawnSync('git', ['merge-file', '--diff3', localPath, tmpBase, tmpRemote], { encoding: 'utf8' });
  await unlink(tmpBase).catch(() => {});
  await unlink(tmpRemote).catch(() => {});
  if (result.status === 0) {
    return { kind: 'MECHANICAL_MERGE_CLEAN', path: rel, reason: 'git merge-file clean' };
  }
  if (typeof result.status === 'number' && result.status > 0 && result.status < 128) {
    return { kind: 'MECHANICAL_MERGE_CONFLICTED', path: rel, hunks: result.status, reason: `${result.status} conflict hunk(s)` };
  }
  throw new Error(`git merge-file failed for ${rel}: status=${result.status} stderr=${(result.stderr || '').toString()}`);
}

async function runSemanticStage(rel, ctx) {
  const base = await resolveBase(rel, ctx.baseline_version, ctx.target, {
    oldManifest: ctx.oldManifest, pack: ctx.pack,
  });
  const remote = await readFile(join(ctx.templateDir, rel));
  const local = await readFile(join(ctx.target, rel));
  await writeStage(ctx, rel, base, remote, local);
  return { kind: 'SEMANTIC_MERGE_STAGED', path: rel, reason: 'staged for /upgrade-project' };
}

async function writeStageArtifact(stageDir, rel, bytes) {
  const dst = join(stageDir, rel);
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, bytes);
}

async function appendToStageManifest(stageDir, ctx, rel, baseBuf, incomingBuf, localBuf) {
  const manifestPath = join(stageDir, 'manifest.json');
  const manifest = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, 'utf8'))
    : newStageManifest(ctx);
  manifest.files.push({
    rel,
    base_sha256: baseBuf === null ? null : sha256(baseBuf),
    incoming_sha256: sha256(incomingBuf),
    local_sha256: sha256(localBuf),
    status: 'PENDING',
  });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

function newStageManifest(ctx) {
  return {
    stage_version: 1,
    slug: ctx.slug ?? 'upgrade',
    created_at: new Date().toISOString(),
    baseline_version_from: ctx.oldManifest?.baseline_version ?? 'unknown',
    baseline_version_to: ctx.baseline_version ?? 'unknown',
    files: [],
  };
}

function stageTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
