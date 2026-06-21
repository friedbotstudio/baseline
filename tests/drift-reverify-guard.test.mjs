// drift-reverify-guard — Velocity Lever (Component 2: drift-check reverify skip)
//
// Covers AC-007, AC-008, AC-009, AC-010 of rightsize-triage-drift-skip.
//
// drift-reverify-guard.mjs lets the tdd drift-check-tick skip the model's
// drift-report re-interpretation when the working tree is provably unchanged
// since the verify-tick binding PASS. It mirrors simplify/reverify-guard.mjs and
// reuses its computeFingerprint/collectTreeState primitives. Same discipline:
//   (1) deterministic fingerprint, (2) fail-safe — exit 3 (skip) only on a
//   positive provably-unchanged match; any doubt (missing snapshot, change,
//   error) => exit 0 (re-verify). The mechanical drift_check.mjs oracle still
//   runs and still gates on real drift — the skip suppresses only the model's
//   re-reading of a CLEAN result.
//
// SUT: .claude/skills/tdd/drift-reverify-guard.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let guard;
try {
  guard = await import(path.join(REPO_ROOT, '.claude/skills/tdd/drift-reverify-guard.mjs'));
} catch (err) {
  throw new Error(
    `.claude/skills/tdd/drift-reverify-guard.mjs not yet implemented. Original: ${err.message}`
  );
}

describe('drift-reverify-guard capture/check CLI (injected deps)', () => {
  const mkDeps = (stateDir, treeState) => ({ stateDir, treeState });

  it('test_when_tree_unchanged_since_capture_then_check_exit_3', async () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), 'drg-'));
    try {
      const fixedTree = () => ({ diff: 'D', untracked: [{ path: 'a', sha256: 'h' }] });
      const cap = await guard.main(['capture', 'slugX'], mkDeps(stateDir, fixedTree));
      assert.equal(cap, 0);
      const chk = await guard.main(['check', 'slugX'], mkDeps(stateDir, fixedTree));
      assert.equal(chk, 3); // provably unchanged since verify => skip model re-read
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('test_when_tree_changed_after_capture_then_check_exit_0', async () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), 'drg-'));
    try {
      const cap = await guard.main(['capture', 'slugX'], mkDeps(stateDir, () => ({ diff: 'D1', untracked: [] })));
      assert.equal(cap, 0);
      const chk = await guard.main(['check', 'slugX'], mkDeps(stateDir, () => ({ diff: 'D2', untracked: [] })));
      assert.equal(chk, 0); // changed => re-verify (full drift interpretation)
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('test_when_fingerprint_missing_then_check_exit_0', async () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), 'drg-'));
    try {
      const chk = await guard.main(['check', 'neverCaptured'], mkDeps(stateDir, () => ({ diff: 'D', untracked: [] })));
      assert.equal(chk, 0); // fail-safe: no snapshot => re-verify
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('test_when_capture_missing_slug_then_noop_exit_0', async () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), 'drg-'));
    try {
      const cap = await guard.main(['capture'], mkDeps(stateDir, () => ({ diff: 'D', untracked: [] })));
      assert.equal(cap, 0); // missing slug => noop, no throw
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe('drift-reverify-guard reuses the proven fingerprint primitives', () => {
  it('test_when_module_then_exports_fingerprint_primitives', () => {
    assert.equal(typeof guard.computeFingerprint, 'function');
    assert.equal(typeof guard.collectTreeState, 'function');
  });
});

describe('tdd SKILL.md documents the reverify-skip protocol (AC-010)', () => {
  it('test_when_drift_skill_doc_then_states_drift_check_runs_on_exit3', () => {
    const skill = readFileSync(path.join(REPO_ROOT, '.claude/skills/tdd/SKILL.md'), 'utf8');
    // The protocol must make explicit that the mechanical oracle still gates even
    // when the fingerprint is unchanged — the skip suppresses model re-reading of a
    // CLEAN result only, never real drift.
    assert.match(skill, /drift-reverify-guard/);
    assert.match(skill, /drift_check\.mjs still runs/i);
    assert.match(skill, /exit\s*1|unresolved/i);
  });
});
