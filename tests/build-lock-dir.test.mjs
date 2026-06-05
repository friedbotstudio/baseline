// Phase 6 (build-mutex-per-target): scripts/build-lock-dir.mjs derives a
// PER-TARGET build lock dir so concurrent builds into DIFFERENT target dirs
// (the isolated tmpdir builds from tests/helpers/clone-and-build.mjs) no longer
// serialize on a single machine-global mkdir mutex, while builds into the SAME
// target (npm pack prepack + a live-tree build) still share one lock and
// serialize.
//
// The helper takes argv[2] = a build target dir and prints to stdout a lock dir
// path of shape ${TMPDIR:-/tmp}/create-baseline-build.<key>.lock.d, where <key>
// is a stable hash of the target dir string.
//
// RED until scripts/build-lock-dir.mjs exists: spawnSync('node', [SCRIPT]) on a
// missing script exits non-zero with an ENOENT-class error, failing every
// assertion below for the right reason.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = resolve(REPO_ROOT, 'scripts/build-lock-dir.mjs');

// Run the helper with a target dir arg; return trimmed stdout. `env` lets a
// test pin TMPDIR. Asserts a clean exit so a missing/erroring script fails the
// test with the captured stderr rather than silently returning ''.
function lockDirFor(targetDir, env = {}) {
  const r = spawnSync('node', [SCRIPT, targetDir], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `build-lock-dir.mjs must exit 0 for a valid target.\n${r.stdout}\n${r.stderr}`);
  return r.stdout.trim();
}

describe('build-lock-dir — per-target lock keying', () => {
  it('test_when_distinct_targets_then_distinct_lock_dirs', () => {
    const a = lockDirFor('/tmp/clone-a/obj/template');
    const b = lockDirFor('/tmp/clone-b/obj/template');
    assert.notEqual(a, b, 'distinct target dirs must map to distinct lock dirs so isolated builds can run concurrently');
  });

  it('test_when_same_target_then_stable_lock_dir', () => {
    const target = '/tmp/clone-a/obj/template';
    const first = lockDirFor(target);
    const second = lockDirFor(target);
    assert.equal(first, second, 'the same target dir must map to a byte-identical, stable lock dir (preserves same-target serialization)');
  });

  it('test_when_lock_dir_computed_then_under_tmpdir_and_lock_d_suffix', () => {
    const tmp = '/tmp/known-tmpdir-fixture';
    const lock = lockDirFor('/tmp/clone-a/obj/template', { TMPDIR: tmp });
    assert.ok(lock.startsWith(tmp + '/'), `lock dir must live under TMPDIR (${tmp}); got ${lock}`);
    assert.ok(lock.endsWith('.lock.d'), `lock dir must keep the .lock.d mkdir-mutex suffix; got ${lock}`);
  });

  it('test_when_live_repo_target_then_single_stable_lock', () => {
    const liveTarget = resolve(REPO_ROOT, 'obj/template');
    const live1 = lockDirFor(liveTarget);
    const live2 = lockDirFor(liveTarget);
    assert.equal(live1, live2, 'the live repo-root target must map to one stable lock (prepack + live build co-serialize)');

    const isolated = lockDirFor('/tmp/some-clone/obj/template');
    assert.notEqual(live1, isolated, 'the live target lock must differ from an isolated tmp target lock');
  });
});
