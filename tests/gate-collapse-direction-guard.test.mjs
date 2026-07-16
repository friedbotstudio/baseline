// Tests for direction_approval_guard.mjs — the renamed/expanded spec_approval_guard
// (spec: docs/specs/gate-collapse.md, AC-002 / AC-006, D-1/D-2/D-6).
//
// Forge-proof invariant, unchanged by the collapse: the direction-approval token
// at spec_approvals/<slug>.approval (D-2: path reused so epic_approval_guard's
// root is preserved) is writable only on a fresh, slug-matched
// .direction_approval_grant marker; Claude may never write the marker itself, and
// may never self-mark a spec Approved. Per D-6 the shippability/checker-fanout
// BLOCKED cross-checks are NOT in this guard (they move to the pre-implementation
// checkpoint) — this guard runs at intake time, before those verdicts exist.
//
// Drives the guard via spawnSync with synthetic stdin in an isolated temp
// CLAUDE_PROJECT_DIR. Mirrors tests/epic-approval-guard.test.mjs.
//
// FAILS until .claude/hooks/direction_approval_guard.mjs and the
// CONSENT_MARKER_DIRECTION constant exist.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIRECTION_GUARD = join(REPO_ROOT, '.claude/hooks/direction_approval_guard.mjs');
const LIB_DIR = join(REPO_ROOT, '.claude/hooks/lib');
const MARKER_REL = '.claude/state/.direction_approval_grant';

const SANDBOXES = [];

function buildSandbox({ marker } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dirg-'));
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state/spec_approvals'), { recursive: true });
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  cpSync(DIRECTION_GUARD, join(root, '.claude/hooks/direction_approval_guard.mjs'));
  cpSync(LIB_DIR, join(root, '.claude/hooks/lib'), { recursive: true });
  writeFileSync(join(root, '.claude/project.json'), JSON.stringify({ configured: true, consent: { gate_marker_ttl_seconds: 120 } }, null, 2));
  if (marker) writeFileSync(join(root, MARKER_REL), marker);
  SANDBOXES.push(root);
  return root;
}

function run(root, payload) {
  const res = spawnSync('node', [join(root, '.claude/hooks/direction_approval_guard.mjs')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { denied: (res.stdout || '').includes('"permissionDecision":"deny"'), status: res.status, stdout: res.stdout, stderr: res.stderr };
}

const freshMarker = (slug) => `${slug}\n${Math.floor(Date.now() / 1000)}\n`;
const staleMarker = (slug) => `${slug}\n${Math.floor(Date.now() / 1000) - 3600}\n`;
// file_path must be ABSOLUTE (under the sandbox root): canonicalRel resolves a
// relative path against process.cwd() — the repo — not CLAUDE_PROJECT_DIR.
// Mirrors tests/epic-approval-guard.test.mjs (writeEpic uses join(root, ...)).
const writeToken = (root, slug) => ({ tool_name: 'Write', tool_input: { file_path: join(root, `.claude/state/spec_approvals/${slug}.approval`), content: 'APPROVED\n1700000000\n/abs/intake.md\nN/A\ndeadbeef\n' } });

after(() => { for (const s of SANDBOXES) { try { rmSync(s, { recursive: true, force: true }); } catch {} } });

describe('direction_approval_guard — forge-proof (AC-002)', () => {
  it('test_when_human_approve_direction_then_guard_allows_token_write', () => {
    const root = buildSandbox({ marker: freshMarker('alpha') });
    const r = run(root, writeToken(root, 'alpha'));
    assert.equal(r.denied, false, `expected allow, got: ${r.stdout || r.stderr}`);
  });

  it('test_when_claude_writes_direction_marker_then_blocked', () => {
    const root = buildSandbox({ marker: freshMarker('alpha') });
    const r = run(root, { tool_name: 'Write', tool_input: { file_path: join(root, MARKER_REL), content: 'alpha\n1700000000\n' } });
    assert.equal(r.denied, true, 'marker self-write must be BLOCKED');
  });

  it('test_when_claude_writes_status_approved_in_spec_then_blocked', () => {
    const root = buildSandbox({});
    const r = run(root, { tool_name: 'Write', tool_input: { file_path: join(root, 'docs/specs/alpha.md'), content: '# Spec\n\nStatus: Approved\n' } });
    assert.equal(r.denied, true, 'self-approval line in a spec must be BLOCKED');
  });

  it('test_when_marker_missing_then_token_write_blocked', () => {
    const root = buildSandbox({});
    const r = run(root, writeToken(root, 'alpha'));
    assert.equal(r.denied, true, 'no marker → token write BLOCKED');
  });

  it('test_when_marker_expired_then_token_write_blocked', () => {
    const root = buildSandbox({ marker: staleMarker('alpha') });
    const r = run(root, writeToken(root, 'alpha'));
    assert.equal(r.denied, true, 'expired marker (>120s) → BLOCKED');
  });

  it('test_when_marker_slug_mismatch_then_token_write_blocked', () => {
    const root = buildSandbox({ marker: freshMarker('alpha') });
    const r = run(root, writeToken(root, 'beta'));
    assert.equal(r.denied, true, 'slug mismatch (marker alpha, token beta) → BLOCKED');
  });

  it('test_when_unrelated_write_then_allowed', () => {
    const root = buildSandbox({});
    const r = run(root, { tool_name: 'Write', tool_input: { file_path: join(root, 'src/foo.js'), content: 'x' } });
    assert.equal(r.denied, false, 'unrelated write must pass through');
  });
});
