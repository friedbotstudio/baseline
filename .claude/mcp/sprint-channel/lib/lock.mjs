// Foundation: an atomic lock built on mkdir. mkdirSync is atomic on POSIX and
// Windows, so the first caller to create the lock dir wins; a concurrent caller
// gets EEXIST. This is the race-safety primitive behind claim_task.

import { mkdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';

export function withLock(channelRoot, key, fn) {
  const lockDir = join(channelRoot, `.lock-${key}`);
  try {
    mkdirSync(lockDir);
  } catch (err) {
    if (err.code === 'EEXIST') return { acquired: false };
    throw err;
  }
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
