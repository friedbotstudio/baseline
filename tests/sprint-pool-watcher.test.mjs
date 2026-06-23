import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The 750ms poll-watch loop is removed by the broker transport (AC-006): delivery is
// event-native over the socket, so watcher.mjs must be gone and no sprint-pool server
// file may still reference the watch-loop entry points. This file replaces the old
// pollOnce unit tests (the module they covered no longer exists).
const poolDir = new URL('../.claude/mcp/sprint-pool/', import.meta.url);

test('test_when_broker_transport_then_watcher_module_deleted', () => {
  assert.equal(existsSync(new URL('watcher.mjs', poolDir)), false, 'watcher.mjs is deleted under the broker transport');
});

test('test_when_broker_transport_then_no_pool_file_imports_watch_loop', () => {
  const dir = poolDir.pathname;
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs'));
  const offenders = files.filter((f) => {
    const src = readFileSync(join(dir, f), 'utf8');
    return /\bpollOnce\b/.test(src) || /\bstartWatchLoop\b/.test(src) || /watcher\.mjs/.test(src);
  });
  assert.deepEqual(offenders, [], 'no sprint-pool file references pollOnce / startWatchLoop / watcher.mjs');
});
