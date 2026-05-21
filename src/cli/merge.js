import { cp, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { hashFile, saveManifest } from './manifest.js';
import { deepMergeMcpServers } from './mcp.js';
import { NEVER_TOUCH, SPECIAL_MERGE } from './install.js';
import { pathExists } from './util.js';
import { dispatchByTier, NoBaseError, canRecoverBase } from './upgrade-tiers.js';

export const ACTION_KINDS = Object.freeze({
  ADD: 'ADD',
  OVERWRITE: 'OVERWRITE',
  NOOP: 'NOOP',
  SKIP_CUSTOMIZED: 'SKIP_CUSTOMIZED',
  PRUNE: 'PRUNE',
  PRUNE_SKIPPED_CUSTOMIZED: 'PRUNE_SKIPPED_CUSTOMIZED',
  NEVER_TOUCH_PRESERVE: 'NEVER_TOUCH_PRESERVE',
  NEVER_TOUCH_ADD: 'NEVER_TOUCH_ADD',
  SPECIAL_MERGE: 'SPECIAL_MERGE',
  MECHANICAL_MERGE_CLEAN: 'MECHANICAL_MERGE_CLEAN',
  MECHANICAL_MERGE_CONFLICTED: 'MECHANICAL_MERGE_CONFLICTED',
  SEMANTIC_MERGE_STAGED: 'SEMANTIC_MERGE_STAGED',
});

// User-facing labels for each ACTION_KIND. Surfaced in the per-file upgrade
// report (TTY via `tui/upgrade.js`, non-TTY via `bin/cli.js dispatchUpgrade`).
// Kept centralized so both paths render identically.
export const ACTION_LABELS = Object.freeze({
  ADD: 'add',
  OVERWRITE: 'update',
  NOOP: 'unchanged',
  SKIP_CUSTOMIZED: 'kept yours',
  PRUNE: 'removed (upstream)',
  PRUNE_SKIPPED_CUSTOMIZED: 'kept yours (upstream removed)',
  NEVER_TOUCH_PRESERVE: 'kept yours (never-touch)',
  NEVER_TOUCH_ADD: 'add (never-touch)',
  SPECIAL_MERGE: 'merged (.mcp.json deep-merge)',
  MECHANICAL_MERGE_CLEAN: 'merged cleanly',
  MECHANICAL_MERGE_CONFLICTED: 'merged with conflicts — resolve manually',
  SEMANTIC_MERGE_STAGED: 'staged for /upgrade-project',
});

export const ACTION_LABEL_WIDTH = Math.max(...Object.values(ACTION_LABELS).map((s) => s.length));

async function copyFile(src, dst) {
  await mkdir(dirname(dst), { recursive: true });
  await cp(src, dst, { force: true });
}

function readShaFromEntry(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && typeof entry.sha256 === 'string') return entry.sha256;
  return null;
}

function readTierFromEntry(entry) {
  if (entry && typeof entry === 'object' && typeof entry.tier === 'string') return entry.tier;
  // Bare-sha entries (legacy shipped manifest_version: 2 OR installed-manifest
  // round-trips without tier overlay) fall back to BINARY_PROMPT — the safe
  // default that preserves today's two-way prompt behavior. New shipped
  // manifests (v3+) carry `{sha256, tier}` per file and exercise the full
  // three-tier flow.
  return 'BINARY_PROMPT';
}

export async function threeWayMerge(templateDir, target, oldManifest, newManifest, opts = {}) {
  const { dryRun = false, onSkipCustomized = null, pack = null } = opts;
  const actions = [];
  const oldFiles = oldManifest?.files ?? {};
  const newFiles = newManifest?.files ?? {};
  const baseline_version = oldManifest?.baseline_version;
  const allPaths = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);

  const tierCtx = {
    target,
    templateDir,
    oldManifest,
    newManifest,
    baseline_version,
    pack,
    stageRunTs: null,
  };

  for (const rel of allPaths) {
    const tplPath = join(templateDir, rel);
    const tgtPath = join(target, rel);

    if (NEVER_TOUCH.includes(rel)) {
      if (await pathExists(tgtPath)) {
        actions.push({ kind: ACTION_KINDS.NEVER_TOUCH_PRESERVE, path: rel, reason: 'NEVER_TOUCH path present in target' });
      } else if (rel in newFiles) {
        if (!dryRun) await copyFile(tplPath, tgtPath);
        actions.push({ kind: ACTION_KINDS.NEVER_TOUCH_ADD, path: rel, reason: 'NEVER_TOUCH path absent; written from template' });
      }
      continue;
    }

    if (SPECIAL_MERGE.includes(rel)) {
      if (rel in newFiles && await pathExists(tplPath)) {
        if (!dryRun) await deepMergeMcpServers(tplPath, tgtPath);
        actions.push({ kind: ACTION_KINDS.SPECIAL_MERGE, path: rel, reason: 'additive deep-merge applied' });
      }
      continue;
    }

    const newEntry = newFiles[rel];
    const oldEntry = oldFiles[rel];
    const newHash = readShaFromEntry(newEntry);
    const oldHash = readShaFromEntry(oldEntry);
    const targetExists = await pathExists(tgtPath);
    const tgtHash = targetExists ? await hashFile(tgtPath) : null;

    if (!targetExists && newHash) {
      if (!dryRun) await copyFile(tplPath, tgtPath);
      actions.push({ kind: ACTION_KINDS.ADD, path: rel, reason: 'new in template; not present in target' });
      continue;
    }

    if (newHash && tgtHash === newHash) {
      actions.push({ kind: ACTION_KINDS.NOOP, path: rel, reason: 'target already matches new template' });
      continue;
    }

    if (newHash && oldHash && tgtHash === oldHash) {
      if (!dryRun) await copyFile(tplPath, tgtPath);
      actions.push({ kind: ACTION_KINDS.OVERWRITE, path: rel, reason: 'target untouched since last install; updated' });
      continue;
    }

    if (newHash && tgtHash && tgtHash !== oldHash) {
      const action = await dispatchCustomized({
        rel, newEntry, tierCtx, dryRun, onSkipCustomized, tplPath, tgtPath,
      });
      actions.push(action);
      continue;
    }

    if (!newHash && oldHash) {
      // File was part of the baseline at last install but has since been
      // removed upstream. Two cases:
      //   - target unchanged since last install (tgtHash == oldHash) → safe to
      //     prune. Otherwise the user accumulates stale baseline files forever.
      //   - target customized (tgtHash != oldHash) → preserve to avoid
      //     destroying user work; report drift via exit 3.
      if (targetExists && tgtHash === oldHash) {
        if (!dryRun) await unlink(tgtPath);
        actions.push({ kind: ACTION_KINDS.PRUNE, path: rel, reason: 'removed from new template; target was untouched — deleted' });
      } else if (targetExists) {
        actions.push({ kind: ACTION_KINDS.PRUNE_SKIPPED_CUSTOMIZED, path: rel, reason: 'removed from new template; target customized — preserved' });
      }
      continue;
    }
  }

  if (newManifest && !dryRun) {
    await mkdir(join(target, '.claude'), { recursive: true });
    await saveManifest(join(target, '.claude/.baseline-manifest.json'), newManifest);
  }

  return { actions, exitCode: computeExitCode(actions) };
}

async function dispatchCustomized({ rel, newEntry, tierCtx, dryRun, onSkipCustomized, tplPath, tgtPath }) {
  const tier = readTierFromEntry(newEntry);
  if (tier === 'MECHANICAL' || tier === 'SEMANTIC') {
    if (dryRun) {
      // When BASE recovery would fail (legacy manifest with no cache hit, no
      // npm fallback), the real run will fall through to the binary prompt.
      // Surface this file as SKIP_CUSTOMIZED at dry-run time so the TUI
      // collects a user choice up front instead of silently keep-mine'ing it.
      if (!canRecoverBase(rel, tierCtx.baseline_version, tierCtx.target)) {
        return { kind: ACTION_KINDS.SKIP_CUSTOMIZED, path: rel, reason: 'BASE unrecoverable; will prompt user' };
      }
      return { kind: tier === 'MECHANICAL' ? ACTION_KINDS.MECHANICAL_MERGE_CLEAN : ACTION_KINDS.SEMANTIC_MERGE_STAGED, path: rel, reason: 'dry-run: tier dispatch deferred' };
    }
    try {
      return await dispatchByTier(rel, tier, tierCtx);
    } catch (err) {
      if (err instanceof NoBaseError) {
        return fallbackToBinaryPrompt({ rel, onSkipCustomized, dryRun, tplPath, tgtPath, err });
      }
      throw err;
    }
  }
  return fallbackToBinaryPrompt({ rel, onSkipCustomized, dryRun, tplPath, tgtPath });
}

async function fallbackToBinaryPrompt({ rel, onSkipCustomized, dryRun, tplPath, tgtPath, err = null }) {
  const choice = onSkipCustomized ? await onSkipCustomized(rel) : 'keep-mine';
  if (choice === 'take-theirs') {
    if (!dryRun) await copyFile(tplPath, tgtPath);
    return { kind: ACTION_KINDS.OVERWRITE, path: rel, reason: err ? `BASE recovery failed (${err.kind}); user chose take-theirs` : 'customized file; user chose take-theirs' };
  }
  return { kind: ACTION_KINDS.SKIP_CUSTOMIZED, path: rel, reason: err ? `BASE recovery failed (${err.kind}); preserved` : 'target customized since last install' };
}

function computeExitCode(actions) {
  let code = 0;
  for (const a of actions) {
    if (a.kind === ACTION_KINDS.SEMANTIC_MERGE_STAGED) code = Math.max(code, 5);
    else if (a.kind === ACTION_KINDS.MECHANICAL_MERGE_CONFLICTED) code = Math.max(code, 4);
    else if (a.kind === ACTION_KINDS.SKIP_CUSTOMIZED || a.kind === ACTION_KINDS.PRUNE_SKIPPED_CUSTOMIZED) {
      code = Math.max(code, 3);
    }
  }
  return code;
}
