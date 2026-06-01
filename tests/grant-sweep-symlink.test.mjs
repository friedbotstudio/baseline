// Club A — 7f2c LOW: the memory_session_start grant-marker sweep must not
// follow a symlink to its target. The sweep is lifted into common.mjs as the
// exported `sweepLeakedGrantMarkers(stateDir, opts)` so it is unit-testable.
//
// RED until: sweepLeakedGrantMarkers exists in common.mjs and uses lstat to
// detect a symlinked marker, removing only the link (never the target).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMON = join(REPO_ROOT, '.claude/hooks/lib/common.mjs');

describe('7f2c LOW — grant-marker sweep does not follow a symlink to delete the target', () => {
  it('test_when_session_start_grant_marker_is_symlink_then_not_followed', async () => {
    const { sweepLeakedGrantMarkers } = await import(COMMON);
    const dir = mkdtempSync(join(tmpdir(), 'grant-sweep-'));
    try {
      // A precious file outside the marker contract.
      const target = join(dir, 'precious.txt');
      writeFileSync(target, 'do not delete me\n');
      // A leaked grant marker that is actually a SYMLINK to the precious file,
      // with an ancient epoch on line 1 (well past any TTL).
      const marker = join(dir, '.commit_consent_grant');
      // The symlink's "content" (followed) starts with an old epoch so a
      // follow-then-age path would consider it sweepable.
      writeFileSync(target, '100\n');
      symlinkSync(target, marker);

      sweepLeakedGrantMarkers(dir, { ttlSeconds: 0, nowMs: Date.now() });

      // The TARGET must survive — the sweep must not delete through the symlink.
      assert.equal(existsSync(target), true, 'symlink target must NOT be deleted by the sweep');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
