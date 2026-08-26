// The changed-set resolver — one git call per distinct (stamp, HEAD), reused
// across runs while HEAD holds still.
//
// The cost this defends against was measured on the live store at 7fd51c0:
// memory_session_start.mjs spawned `git diff --name-only <stamp>..HEAD` once per
// entry, 433 times, for 62 seconds of wall clock. Of those 433 entries only 119
// have a verdict that reads the result, and those carry 8 distinct stamps.
//
// Covers AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008.
//
// Spawn COUNTS are asserted here, never wall clock. A timing assertion passes or
// fails on the machine it runs on; a call count is the thing the fix is about.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { tryImport, writeShard } from './helpers/memory-fixtures.mjs';
import { makeGitProject, headSha, advanceCommits } from './helpers/memory-git-fixtures.mjs';

const MODULE_REL = '.claude/hooks/lib/memory_changed_set.mjs';
const CACHE_REL = join('.claude', 'state', 'memory', 'changed-set-cache.json');

let mod;

describe('changed-set resolver — one call per distinct stamp (AC-002, AC-007, AC-008)', () => {
  test('test_when_module_is_imported_then_it_exposes_create_resolver', async () => {
    mod = await tryImport(MODULE_REL);
    assert.ok(mod, `${MODULE_REL} must import cleanly`);
    assert.equal(typeof mod.createResolver, 'function', 'createResolver must be exported');
  });

  // A spawn stand-in that records every argv it is handed. Counting is the point:
  // the fix is "fewer calls", so the test has to be able to see the calls.
  // MOCK: the injected process spawner. Real git runs in the integration tests below.
  function countingSpawn(result = { status: 0, stdout: 'a.mjs\nb.mjs\n' }) {
    const calls = [];
    const spawn = (bin, args) => {
      calls.push({ bin, args });
      return { ...result, stdout: result.stdout ?? '' };
    };
    return { spawn, calls };
  }

  function resolverWith(spawn, over = {}) {
    return mod.createResolver({
      rootDir: '/nonexistent-root',
      head: 'abcdef1',
      cachePath: '/nonexistent-root/no-such-cache.json',
      spawn,
      ...over,
    });
  }

  test('test_when_same_stamp_requested_twice_then_git_runs_once', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { spawn, calls } = countingSpawn();
    const r = resolverWith(spawn);

    const first = r.changedSince('1234567');
    const second = r.changedSince('1234567');

    assert.equal(calls.length, 1, 'the second request must be answered from the memo');
    assert.deepEqual(first, second);
  });

  test('test_when_two_stamps_requested_then_git_runs_once_per_distinct_stamp', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { spawn, calls } = countingSpawn();
    const r = resolverWith(spawn);

    for (const stamp of ['1234567', 'abcdef0', '1234567', 'abcdef0']) r.changedSince(stamp);

    assert.equal(calls.length, 2, 'four requests over two distinct stamps is two spawns');
  });

  test('test_when_stamp_is_an_option_then_no_git_argv_is_built', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { spawn, calls } = countingSpawn();
    const r = resolverWith(spawn);

    // A verified-at of `--output=<path>` once made git write that file and exit 0,
    // silently, on every session. See the landmine entry of the same name.
    const out = r.changedSince('--output=/tmp/should-never-exist');

    assert.equal(out, null, 'a rejected stamp answers null, never an empty array');
    assert.equal(calls.length, 0, 'a rejected stamp must never reach a git argv');
  });

  test('test_when_git_exits_nonzero_then_null_and_no_cache_row', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { spawn, calls } = countingSpawn({ status: 128, stdout: '' });
    const r = resolverWith(spawn);

    const out = r.changedSince('1234567');
    assert.equal(out, null, 'a failed call is "could not tell", not "nothing moved"');

    r.changedSince('1234567');
    assert.equal(calls.length, 2, 'a failure is not memoized, so the next call retries');
  });

  test('test_when_git_returns_empty_output_then_empty_array_not_null', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { spawn } = countingSpawn({ status: 0, stdout: '' });
    const r = resolverWith(spawn);

    assert.deepEqual(r.changedSince('1234567'), [], 'a clean exit with no paths means nothing moved');
  });
});

describe('changed-set cache — keyed on HEAD, disposable (AC-003, AC-004, AC-005)', () => {
  function project() {
    const p = makeGitProject('memchanged-');
    return { ...p, cachePath: join(p.root, CACHE_REL) };
  }

  function writeCache(cachePath, value) {
    mkdirSync(join(cachePath, '..'), { recursive: true });
    writeFileSync(cachePath, value, 'utf8');
  }

  test('test_when_cache_head_matches_then_no_git_runs', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { root, cachePath } = project();
    const head = headSha(root);
    writeCache(cachePath, JSON.stringify({ head, sets: { '1234567': ['x.mjs'] } }));

    const calls = [];
    const r = mod.createResolver({
      rootDir: root,
      head,
      cachePath,
      spawn: (bin, args) => { calls.push({ bin, args }); return { status: 0, stdout: '' }; },
    });

    assert.deepEqual(r.changedSince('1234567'), ['x.mjs']);
    assert.equal(calls.length, 0, 'a warm cache answers without git');
    rmSync(root, { recursive: true, force: true });
  });

  test('test_when_cache_head_differs_then_cache_is_ignored', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { root, cachePath } = project();
    writeCache(cachePath, JSON.stringify({ head: '0000000', sets: { '1234567': ['stale.mjs'] } }));

    const calls = [];
    const r = mod.createResolver({
      rootDir: root,
      head: headSha(root),
      cachePath,
      spawn: (bin, args) => { calls.push({ bin, args }); return { status: 0, stdout: 'fresh.mjs\n' }; },
    });

    assert.deepEqual(r.changedSince('1234567'), ['fresh.mjs'], 'sets written under another HEAD are discarded');
    assert.equal(calls.length, 1);
    rmSync(root, { recursive: true, force: true });
  });

  for (const [label, body] of [
    ['unparseable', '{"head": "abcdef1", "sets": {'],
    ['empty', ''],
    ['not an object', '"a string"'],
  ]) {
    test(`test_when_cache_file_is_${label.replace(/ /g, '_')}_then_memo_starts_empty`, async () => {
      mod = mod ?? (await tryImport(MODULE_REL));
      const { root, cachePath } = project();
      writeCache(cachePath, body);

      const calls = [];
      const r = mod.createResolver({
        rootDir: root,
        head: headSha(root),
        cachePath,
        spawn: (bin, args) => { calls.push({ bin, args }); return { status: 0, stdout: 'x.mjs\n' }; },
      });

      assert.deepEqual(r.changedSince('1234567'), ['x.mjs']);
      assert.equal(calls.length, 1, 'an unusable cache is the same state as no cache');
      rmSync(root, { recursive: true, force: true });
    });
  }

  test('test_when_cache_file_is_absent_then_memo_starts_empty', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { root, cachePath } = project();

    const r = mod.createResolver({
      rootDir: root,
      head: headSha(root),
      cachePath,
      spawn: () => ({ status: 0, stdout: 'x.mjs\n' }),
    });

    assert.deepEqual(r.changedSince('1234567'), ['x.mjs']);
    rmSync(root, { recursive: true, force: true });
  });

  test('test_when_nothing_was_computed_then_persist_writes_no_file', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { root, cachePath } = project();

    const r = mod.createResolver({ rootDir: root, head: headSha(root), cachePath, spawn: () => ({ status: 0, stdout: '' }) });
    r.persist();

    assert.equal(existsSync(cachePath), false, 'a run that computed nothing writes nothing');
    rmSync(root, { recursive: true, force: true });
  });

  test('test_when_a_set_was_computed_then_persist_writes_head_and_sets', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { root, cachePath } = project();
    const head = headSha(root);

    const r = mod.createResolver({ rootDir: root, head, cachePath, spawn: () => ({ status: 0, stdout: 'x.mjs\n' }) });
    r.changedSince('1234567');
    r.persist();

    const written = JSON.parse(readFileSync(cachePath, 'utf8'));
    assert.equal(written.head, head);
    assert.deepEqual(written.sets['1234567'], ['x.mjs']);
    rmSync(root, { recursive: true, force: true });
  });

  test('test_when_a_call_failed_then_persist_stores_no_row_for_it', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { root, cachePath } = project();

    const r = mod.createResolver({ rootDir: root, head: headSha(root), cachePath, spawn: () => ({ status: 128, stdout: '' }) });
    r.changedSince('1234567');
    r.persist();

    assert.equal(existsSync(cachePath), false, 'a failure must never be cached as an answer');
    rmSync(root, { recursive: true, force: true });
  });

  test('test_when_cache_dir_is_unwritable_then_persist_swallows_the_failure', async () => {
    mod = mod ?? (await tryImport(MODULE_REL));
    const { root } = project();
    const cachePath = join(root, 'no', 'such', 'nested', 'cache.json');

    const r = mod.createResolver({ rootDir: root, head: headSha(root), cachePath, spawn: () => ({ status: 0, stdout: 'x.mjs\n' }) });
    r.changedSince('1234567');

    assert.doesNotThrow(() => r.persist(), 'a cache write failure must never take the session down');
    rmSync(root, { recursive: true, force: true });
  });
});

describe('buildIndex over the resolver — same answer, cached or not (AC-003, AC-004, AC-006)', () => {
  const HOOK_REL = '.claude/hooks/lib/memory_session_start.mjs';

  // A landmark governs a real path and sits in neither exempt class, so its
  // verdict is the one that actually reads a changed-set.
  function seedStore(memDir, stamp) {
    writeShard(memDir, 'landmarks', 'one', {
      key: 'one',
      fields: { governs: 'src/a.mjs', 'verified-at': stamp, 'last-touched': '2026-08-01' },
      bodyLines: ['- a landmark'],
    });
    writeShard(memDir, 'landmarks', 'two', {
      key: 'two',
      fields: { governs: 'src/b.mjs', 'verified-at': stamp, 'last-touched': '2026-08-01' },
      bodyLines: ['- another landmark sharing the stamp'],
    });
    // No governs: this one takes the date leg and must cost no git call at all.
    writeShard(memDir, 'landmarks', 'three', {
      key: 'three',
      fields: { 'verified-at': stamp, 'last-touched': '2026-08-01' },
      bodyLines: ['- a landmark with no governed path'],
    });
  }

  function staleRows(rendered) {
    return rendered.split('\n').filter((l) => /^\|\s*`[a-z-]+\.md`/.test(l)).join('\n');
  }

  test('test_when_index_built_warm_then_cache_is_not_rewritten_and_stale_rows_match', async () => {
    const hook = await tryImport(HOOK_REL);
    assert.ok(hook, `${HOOK_REL} must import cleanly`);

    const { root, memDir } = makeGitProject('memidx-');
    const stamp = headSha(root);
    seedStore(memDir, stamp);
    advanceCommits(root, 2);

    const cachePath = join(root, CACHE_REL);
    const cold = hook.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' });
    assert.equal(existsSync(cachePath), true, 'a cold run leaves a cache behind');
    const coldMtime = statSync(cachePath).mtimeMs;

    const warm = hook.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' });

    assert.equal(staleRows(warm), staleRows(cold), 'the warm run reports exactly what the cold run did');
    assert.equal(statSync(cachePath).mtimeMs, coldMtime, 'a warm run computes nothing, so it writes nothing');
    rmSync(root, { recursive: true, force: true });
  });

  test('test_when_head_moves_then_stale_rows_match_a_cache_free_run', async () => {
    const hook = await tryImport(HOOK_REL);
    const { root, memDir } = makeGitProject('memidx-');
    const stamp = headSha(root);
    seedStore(memDir, stamp);
    advanceCommits(root, 1);

    const cachePath = join(root, CACHE_REL);
    hook.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' });
    // Without this the comparison below is two uncached runs, which are trivially
    // equal and would pass with the fix absent.
    assert.equal(existsSync(cachePath), true, 'the first run must leave a cache for this test to mean anything');
    advanceCommits(root, 1);

    const cached = hook.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' });
    rmSync(cachePath, { force: true });
    const uncached = hook.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' });

    assert.equal(staleRows(cached), staleRows(uncached), 'a cache built under an older HEAD must not change the answer');
    rmSync(root, { recursive: true, force: true });
  });
});
