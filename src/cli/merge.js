import { cp, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { hashFile, saveManifest } from './manifest.js';
import { deepMergeMcpServers } from './mcp.js';
import { NEVER_TOUCH, SPECIAL_MERGE } from './install.js';
import { pathExists } from './util.js';

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
});

async function copyFile(src, dst) {
  await mkdir(dirname(dst), { recursive: true });
  await cp(src, dst, { force: true });
}

export async function threeWayMerge(templateDir, target, oldManifest, newManifest) {
  const actions = [];
  const oldFiles = oldManifest?.files ?? {};
  const newFiles = newManifest?.files ?? {};
  const allPaths = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);

  for (const rel of allPaths) {
    const tplPath = join(templateDir, rel);
    const tgtPath = join(target, rel);

    if (NEVER_TOUCH.includes(rel)) {
      if (await pathExists(tgtPath)) {
        actions.push({ kind: ACTION_KINDS.NEVER_TOUCH_PRESERVE, path: rel, reason: 'NEVER_TOUCH path present in target' });
      } else if (rel in newFiles) {
        await copyFile(tplPath, tgtPath);
        actions.push({ kind: ACTION_KINDS.NEVER_TOUCH_ADD, path: rel, reason: 'NEVER_TOUCH path absent; written from template' });
      }
      continue;
    }

    if (SPECIAL_MERGE.includes(rel)) {
      if (rel in newFiles && await pathExists(tplPath)) {
        await deepMergeMcpServers(tplPath, tgtPath);
        actions.push({ kind: ACTION_KINDS.SPECIAL_MERGE, path: rel, reason: 'additive deep-merge applied' });
      }
      continue;
    }

    const newHash = newFiles[rel];
    const oldHash = oldFiles[rel];
    const targetExists = await pathExists(tgtPath);
    const tgtHash = targetExists ? await hashFile(tgtPath) : null;

    if (!targetExists && newHash) {
      await copyFile(tplPath, tgtPath);
      actions.push({ kind: ACTION_KINDS.ADD, path: rel, reason: 'new in template; not present in target' });
      continue;
    }

    if (newHash && tgtHash === newHash) {
      actions.push({ kind: ACTION_KINDS.NOOP, path: rel, reason: 'target already matches new template' });
      continue;
    }

    if (newHash && oldHash && tgtHash === oldHash) {
      await copyFile(tplPath, tgtPath);
      actions.push({ kind: ACTION_KINDS.OVERWRITE, path: rel, reason: 'target untouched since last install; updated' });
      continue;
    }

    if (newHash && tgtHash && tgtHash !== oldHash) {
      actions.push({ kind: ACTION_KINDS.SKIP_CUSTOMIZED, path: rel, reason: 'target customized since last install' });
      continue;
    }

    if (!newHash && oldHash) {
      // File was part of the baseline at last install but has since been
      // removed upstream. Two cases:
      //   - target unchanged since last install (tgtHash == oldHash) → safe to
      //     prune. Otherwise the user accumulates stale baseline files forever.
      //   - target customized (tgtHash != oldHash) → preserve to avoid
      //     destroying user work; report drift via exit 3.
      // Pruning only runs when --merge already applies; there is no separate
      // flag (decision recorded in README).
      if (targetExists && tgtHash === oldHash) {
        await unlink(tgtPath);
        actions.push({ kind: ACTION_KINDS.PRUNE, path: rel, reason: 'removed from new template; target was untouched — deleted' });
      } else if (targetExists) {
        actions.push({ kind: ACTION_KINDS.PRUNE_SKIPPED_CUSTOMIZED, path: rel, reason: 'removed from new template; target customized — preserved' });
      }
      continue;
    }
  }

  if (newManifest) {
    await mkdir(join(target, '.claude'), { recursive: true });
    await saveManifest(join(target, '.claude/.baseline-manifest.json'), newManifest);
  }

  const skipKinds = [ACTION_KINDS.SKIP_CUSTOMIZED, ACTION_KINDS.PRUNE_SKIPPED_CUSTOMIZED];
  const exitCode = actions.some((a) => skipKinds.includes(a.kind)) ? 3 : 0;
  return { actions, exitCode };
}
