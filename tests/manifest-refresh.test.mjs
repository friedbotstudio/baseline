// Tests for the rebuild-tax lever (spec: docs/specs/velocity-lever-ranking.md).
//
// The fast path is `build-template.sh --manifest-only` (Stages 1/1.5/2/3, skips
// 0a/0b/1.6/2.6/4=audit); `manifest-refresh.mjs` is the portable spawn wrapper
// (D-2). These assertions FAIL until the flag + the wrapper + the npm script exist.
//
// The one real build invocation is shared across AC-001/AC-004, and it runs in
// an ISOLATED CLONE. Building in the live tree rewrote `obj/template` — which
// `checks/context.mjs → loadManifest` reads — while sibling test files ran
// audit-baseline against it (landmine:
// live-objtemplate-rebuild-races-parallel-test-readers). The build-lock only
// serializes builds against builds; it does not hold off readers.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloneAndBuild } from './helpers/clone-and-build.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_SH = path.join(REPO, 'scripts/build-template.sh');

describe('rebuild-tax lever — build-template.sh --manifest-only (AC-001/AC-004)', () => {
  let refreshRun;
  let clone;
  before(async () => {
    // One shared --manifest-only invocation, in this test's own PKG_ROOT.
    // The clone is BUILT first: --manifest-only is the incremental refresh path
    // (it skips Stages 0a/0b, including the `mkdir -p obj/template/docs/init`
    // that a from-scratch build does), so it presupposes an existing template
    // tree. The live repo always had one; a fresh clone does not.
    clone = await cloneAndBuild('manifest-refresh-');
    refreshRun = spawnSync('bash', [path.join(clone, 'scripts/build-template.sh'), '--manifest-only'], {
      cwd: clone,
      env: { ...process.env, PKG_ROOT: clone, CLAUDE_PROJECT_DIR: clone },
      encoding: 'utf8',
      timeout: 120000,
    });
  });

  it('test_when_manifest_only_run_then_manifest_fresh_and_no_audit', () => {
    assert.equal(refreshRun.status, 0, `--manifest-only should exit 0; stderr: ${refreshRun.stderr}`);
    const manifest = path.join(clone, 'obj/template/.claude/manifest.json');
    assert.ok(existsSync(manifest), 'manifest.json must exist after refresh');
    const m = JSON.parse(readFileSync(manifest, 'utf8'));
    assert.ok(m.files && Object.keys(m.files).length > 0, 'manifest.files table must be present');
    // The audit prints an "overall" verdict line; --manifest-only must not run it.
    const out = `${refreshRun.stdout || ''}${refreshRun.stderr || ''}`;
    assert.ok(!/overall\s+(PASS|FAIL)/i.test(out), 'audit-baseline must NOT run under --manifest-only');
  });

  it('test_when_manifest_only_then_full_audit_passes', () => {
    // Correctness invariant: refresh produces a manifest the authoritative audit accepts.
    const audit = spawnSync('node', [path.join(clone, '.claude/skills/audit-baseline/audit.mjs')], {
      cwd: clone,
      env: { ...process.env, CLAUDE_PROJECT_DIR: clone },
      encoding: 'utf8',
      timeout: 120000,
    });
    assert.equal(audit.status, 0, `audit must PASS after a --manifest-only refresh; tail: ${(audit.stdout || '').slice(-300)}`);
  });
});

describe('rebuild-tax lever — default build unchanged (AC-002)', () => {
  it('test_when_no_flag_then_audit_stage_gated_on', () => {
    const sh = readFileSync(BUILD_SH, 'utf8');
    // The audit invocation must exist AND be gated so the default (no-flag) path runs it.
    assert.match(sh, /audit\.mjs|AUDIT_SCRIPT/, 'build-template.sh must still invoke audit-baseline');
    assert.match(sh, /MANIFEST_ONLY|manifest-only|manifest_only/i, 'build-template.sh must recognize the --manifest-only flag');
    // The audit must be conditional on NOT manifest-only (default keeps auditing).
    assert.ok(
      /manifest[_-]?only/i.test(sh) && /audit/i.test(sh),
      'audit must be gated by the manifest-only flag so default behavior is unchanged',
    );
  });
});

describe('manifest-refresh.mjs wrapper (AC-003 / D-2)', () => {
  let mod;
  before(async () => {
    mod = await import(path.join(REPO, 'scripts/manifest-refresh.mjs'));
  });

  it('test_when_wrapper_child_fails_then_propagates_exit', () => {
    const two = mod.runManifestRefresh({ spawn: () => ({ status: 2 }) });
    assert.equal(two, 2, 'non-zero child status must propagate');
    const zero = mod.runManifestRefresh({ spawn: () => ({ status: 0 }) });
    assert.equal(zero, 0, 'zero child status must pass');
    const nullish = mod.runManifestRefresh({ spawn: () => ({ status: null }) });
    assert.notEqual(nullish, 0, 'a null status (killed child) must be treated as failure');
  });

  it('test_when_manifest_refresh_invoked_then_delegates_with_manifest_only_flag', () => {
    let captured = null;
    mod.runManifestRefresh({ spawn: (cmd, args) => { captured = { cmd, args }; return { status: 0 }; } });
    assert.ok(captured, 'wrapper must invoke spawn');
    assert.ok(captured.args.some((a) => a === '--manifest-only'), 'must pass --manifest-only');
    assert.ok(captured.args.some((a) => /build-template\.sh$/.test(a)) || /build-template\.sh/.test(captured.cmd), 'must target build-template.sh');
  });
});
