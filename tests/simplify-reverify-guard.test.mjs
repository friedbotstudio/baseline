// simplify-reverify-guard — Lever 4b-ii sub-lever A
//
// reverify-guard.mjs lets /simplify skip its redundant Step-5 re-verify when its
// cleanup left the working tree unchanged since the binding PASS. The guard must be
// (1) deterministic — identical tree state yields an identical fingerprint, and
// (2) fail-safe — it only signals "skip" (exit 3) on a positive provably-unchanged
// match; any doubt (missing snapshot, error, any difference) signals "re-verify"
// (exit 0). Skipping verification is only sound when the tree is provably identical.
//
// SUT: .claude/skills/simplify/reverify-guard.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let guard;
try {
  guard = await import(path.join(REPO_ROOT, '.claude/skills/simplify/reverify-guard.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/simplify/reverify-guard.mjs not yet implemented. Original: ${err.message}`
  );
}

const HEX64 = /^[0-9a-f]{64}$/;

describe('reverify-guard fingerprint determinism + sensitivity', () => {
  it('test_when_identical_inputs_then_fingerprint_stable', () => {
    const state = { diff: 'D', untracked: [{ path: 'a', sha256: 'h' }] };
    assert.equal(guard.computeFingerprint(state), guard.computeFingerprint(state));
  });

  it('test_when_diff_differs_then_fingerprint_differs', () => {
    const untracked = [{ path: 'a', sha256: 'h' }];
    assert.notEqual(
      guard.computeFingerprint({ diff: 'D1', untracked }),
      guard.computeFingerprint({ diff: 'D2', untracked }),
    );
  });

  it('test_when_untracked_content_differs_then_fingerprint_differs', () => {
    assert.notEqual(
      guard.computeFingerprint({ diff: 'D', untracked: [{ path: 'a', sha256: 'h1' }] }),
      guard.computeFingerprint({ diff: 'D', untracked: [{ path: 'a', sha256: 'h2' }] }),
    );
  });

  it('test_when_untracked_added_then_fingerprint_differs', () => {
    assert.notEqual(
      guard.computeFingerprint({ diff: 'D', untracked: [{ path: 'a', sha256: 'h' }] }),
      guard.computeFingerprint({ diff: 'D', untracked: [{ path: 'a', sha256: 'h' }, { path: 'b', sha256: 'h' }] }),
    );
  });

  it('test_when_untracked_order_varies_then_fingerprint_stable', () => {
    const a = { path: 'a', sha256: 'ha' };
    const b = { path: 'b', sha256: 'hb' };
    assert.equal(
      guard.computeFingerprint({ diff: 'D', untracked: [a, b] }),
      guard.computeFingerprint({ diff: 'D', untracked: [b, a] }),
    );
  });
});

describe('reverify-guard verdict', () => {
  it('test_when_fingerprints_equal_then_verdict_skip_exit3', () => {
    const v = guard.decideVerdict('abc', 'abc');
    assert.deepEqual(v, { changed: false, verdict: 'skip', exitCode: 3 });
  });

  it('test_when_fingerprints_differ_then_verdict_reverify_exit0', () => {
    const v = guard.decideVerdict('abc', 'xyz');
    assert.deepEqual(v, { changed: true, verdict: 're-verify', exitCode: 0 });
  });
});

describe('reverify-guard tree-state collection (injected IO)', () => {
  it('test_collectTreeState_parses_untracked_and_hashes', () => {
    const exec = (cmd, args) => {
      assert.equal(cmd, 'git');
      if (args.join(' ') === 'diff HEAD') return 'DIFFTEXT';
      if (args.join(' ') === 'ls-files --others --exclude-standard') return 'b\na\n';
      throw new Error(`unexpected exec: ${cmd} ${args.join(' ')}`);
    };
    const readFile = (p) => (p.endsWith('a') ? 'contentA' : 'contentB');
    const state = guard.collectTreeState('/root', { exec, readFile });

    assert.equal(state.diff, 'DIFFTEXT');
    assert.deepEqual(state.untracked.map((u) => u.path), ['a', 'b']); // sorted
    for (const u of state.untracked) assert.match(u.sha256, HEX64);
    assert.notEqual(state.untracked[0].sha256, state.untracked[1].sha256); // distinct content
  });
});

describe('reverify-guard capture/check CLI (injected deps)', () => {
  let stateDir;
  const mkDeps = (treeState) => ({ stateDir, treeState });

  it('test_when_capture_then_check_unchanged_returns_skip', async () => {
    stateDir = mkdtempSync(path.join(tmpdir(), 'rvg-'));
    try {
      const fixedTree = () => ({ diff: 'D', untracked: [{ path: 'a', sha256: 'h' }] });
      const cap = await guard.main(['capture', 'slugX'], mkDeps(fixedTree));
      assert.equal(cap, 0);
      const chk = await guard.main(['check', 'slugX'], mkDeps(fixedTree));
      assert.equal(chk, 3); // provably unchanged => skip
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('test_when_check_missing_stored_fp_returns_reverify', async () => {
    stateDir = mkdtempSync(path.join(tmpdir(), 'rvg-'));
    try {
      const fixedTree = () => ({ diff: 'D', untracked: [] });
      const chk = await guard.main(['check', 'neverCaptured'], mkDeps(fixedTree));
      assert.equal(chk, 0); // fail-safe: no snapshot => re-verify
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
