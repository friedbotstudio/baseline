// Foundation: an atomic lock built on mkdir. mkdirSync is atomic on POSIX and
// Windows, so the first caller to create the lock dir wins; a concurrent caller
// gets EEXIST. This is the race-safety primitive behind claim_task.
//
// A holder that dies mid-task would otherwise leak the lock dir forever, making
// the task unclaimable. To recover, an EEXIST lock older than ttlMs is treated as
// stale and reclaimed via an atomic rename-steal — so among concurrent reclaimers
// exactly one wins and no live lock is ever stolen.

import { mkdirSync, rmdirSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const DEFAULT_LOCK_TTL_MS = 30_000;

// Atomically steal a stale lock dir. renameSync is atomic, so among concurrent
// callers exactly one wins the rename; the losers observe ENOENT and return false.
export function reclaimStaleLock(lockDir) {
  const stolen = `${lockDir}.stale-${randomUUID()}`;
  try {
    renameSync(lockDir, stolen);
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
  try {
    rmdirSync(stolen);
  } catch {
    // best-effort: the stolen dir is uniquely named, orphaned at worst
  }
  return true;
}

function tryMkdir(lockDir) {
  try {
    mkdirSync(lockDir);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  }
}

function acquire(lockDir, ttlMs) {
  if (tryMkdir(lockDir)) return true;
  let held;
  try {
    held = statSync(lockDir);
  } catch (err) {
    if (err.code === 'ENOENT') return tryMkdir(lockDir); // holder released mid-check
    throw err;
  }
  if (Date.now() - held.mtimeMs <= ttlMs) return false; // fresh — a live holder
  reclaimStaleLock(lockDir);
  return tryMkdir(lockDir);
}

export function withLock(channelRoot, key, fn, { ttlMs = DEFAULT_LOCK_TTL_MS } = {}) {
  const lockDir = join(channelRoot, `.lock-${key}`);
  if (!acquire(lockDir, ttlMs)) return { acquired: false };
  try {
    return { acquired: true, result: fn() };
  } finally {
    try {
      rmdirSync(lockDir);
    } catch {
      // lock dir already removed — release is best-effort and idempotent
    }
  }
}
