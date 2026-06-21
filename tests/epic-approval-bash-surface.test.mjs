// Spec: epic-approved-bash-surface (backlog -abad) — epic_approval_guard fires
// only on Write|Edit|MultiEdit, so a Bash write to .claude/state/epic/<slug>.json
// that flips `approved:true` bypasses it (and track_guard trusts the flag). The
// Bash write surface must be closed with PARITY to the consent-token protection:
// destructive_cmd_guard (PreToolUse/Bash) DENIES any Bash command that both
// (a) writes a path under .claude/state/epic/ AND (b) sets approved:true. Writes
// that leave `approved` untouched (children[]/status/timestamps), reads, and
// approved:true writes to non-epic paths stay ALLOWED — mirroring the guard's
// own scope discipline. RED until writesEpicApproval lands in lib/common.mjs and
// destructive_cmd_guard.mjs invokes it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = () => import(join(REPO_ROOT, '.claude/hooks/lib/common.mjs'));
const W = async () => (await imp()).writesEpicApproval;

describe('writesEpicApproval — epic approved:true Bash-write detection', () => {
  // --- the documented forge + its write-shape variants must BLOCK ---
  it('test_when_redirect_sets_approved_true_under_epic_then_blocked', async () => {
    assert.equal(
      (await W())(`echo '{"approved":true}' > .claude/state/epic/foo.json`),
      true,
    );
  });
  it('test_when_tee_sets_approved_true_under_epic_then_blocked', async () => {
    assert.equal(
      (await W())(`echo '{"approved": true}' | tee .claude/state/epic/foo.json`),
      true,
    );
  });
  it('test_when_progwrite_sets_approved_true_under_epic_then_blocked', async () => {
    assert.equal(
      (await W())(
        `node -e "require('fs').writeFileSync('.claude/state/epic/foo.json','{\\"approved\\":true}')"`,
      ),
      true,
    );
  });
  it('test_when_var_indirected_epic_dir_then_blocked', async () => {
    assert.equal(
      (await W())(`D=.claude/state/epic; echo '{"approved":true}' > $D/foo.json`),
      true,
    );
  });

  // --- scope discipline: epic writes that don't flip approved:true must ALLOW ---
  it('test_when_epic_write_without_approved_then_allowed', async () => {
    assert.equal(
      (await W())(`echo '{"children":[],"status":"committed"}' > .claude/state/epic/foo.json`),
      false,
    );
  });
  it('test_when_approved_false_under_epic_then_allowed', async () => {
    assert.equal(
      (await W())(`echo '{"approved":false}' > .claude/state/epic/foo.json`),
      false,
    );
  });
  it('test_when_read_epic_state_then_allowed', async () => {
    assert.equal(
      (await W())('grep approved .claude/state/epic/foo.json'),
      false,
    );
  });
  it('test_when_approved_true_but_not_epic_path_then_allowed', async () => {
    assert.equal(
      (await W())(`echo '{"approved":true}' > /tmp/other.json`),
      false,
    );
  });

  // --- boundary: degenerate inputs ---
  it('test_when_boundary_null_empty_then_false_no_throw', async () => {
    const w = await W();
    assert.equal(w(null), false, 'null');
    assert.equal(w(''), false, 'empty');
    assert.equal(w('git status; ls -la'), false, 'plain command');
  });
});

// Integration: the guard subprocess must DENY the forge end-to-end and ALLOW a
// children-only epic write + a read. Mirrors tests/destructive-consent-write-block.test.mjs.
const GUARD = join(REPO_ROOT, '.claude/hooks/destructive_cmd_guard.mjs');
function runGuard(command) {
  const root = mkdtempSync(join(tmpdir(), 'dcg-epic-'));
  try {
    return spawnSync('node', [GUARD], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      encoding: 'utf8',
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const denied = (r) => /"permissionDecision"\s*:\s*"deny"/i.test((r.stdout || '') + (r.stderr || ''));

describe('destructive_cmd_guard — Bash epic approved:true write block', () => {
  it('test_when_guard_subprocess_sees_epic_forge_then_denied', () => {
    assert.equal(
      denied(runGuard(`echo '{"approved":true}' > .claude/state/epic/foo.json`)),
      true,
      'must DENY the Bash epic approved:true forge',
    );
    assert.equal(
      denied(runGuard(`echo '{"children":[]}' > .claude/state/epic/foo.json`)),
      false,
      'must ALLOW a children-only epic-state write',
    );
    assert.equal(
      denied(runGuard('cat .claude/state/epic/foo.json')),
      false,
      'must ALLOW a read of epic state',
    );
  });
});
