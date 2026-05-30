// Finding B — consent tokens/markers must not be writable via Bash. The gate
// guards only match Write|Edit|MultiEdit, so a Bash write to a consent path
// bypasses them. destructive_cmd_guard (PreToolUse/Bash) must DENY any Bash
// command that WRITES a consent path; reads stay allowed. RED until the block
// lands in destructive_cmd_guard.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(REPO_ROOT, '.claude/hooks/destructive_cmd_guard.mjs');

function runGuard(command) {
  const root = mkdtempSync(join(tmpdir(), 'dcg-'));
  try {
    return spawnSync('node', [GUARD], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      encoding: 'utf8',
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const denied = (r) => /"permissionDecision"\s*:\s*"deny"|consent/i.test((r.stdout || '') + (r.stderr || ''));

const WRITES = [
  'echo 123 > .claude/state/commit_consent',
  'printf "1\\n" >> .claude/state/push_consent',
  'cp /tmp/x .claude/state/.spec_approval_grant',
  'node -e "require(\'fs\').writeFileSync(\'.claude/state/push_consent\',\'1\')"',
  'tee .claude/state/swarm_approvals/x.approval',
  'mv /tmp/y .claude/state/.commit_consent_grant',
  // security MEDIUM follow-ups closed in the same workflow:
  'python3 -c "open(\'.claude/state/commit_consent\',\'w\').write(\'1\')"', // non-JS interpreter write
  'perl -e \'open(F,">",".claude/state/push_consent")\'',                    // perl open-for-write
  'echo 1 >| .claude/state/commit_consent',                                  // >| clobber redirect
];
const READS = [
  'cat .claude/state/commit_consent',
  'ls -la .claude/state',
  'grep 1 .claude/state/commit_consent',
];

describe('destructive_cmd_guard — Bash consent-write block (Finding B)', () => {
  for (const cmd of WRITES) {
    it(`test_when_bash_writes_consent_path_then_denied :: ${cmd.slice(0, 48)}`, () => {
      assert.equal(denied(runGuard(cmd)), true, `must DENY Bash write to a consent path: ${cmd}`);
    });
  }
  for (const cmd of READS) {
    it(`test_when_bash_reads_consent_path_then_allowed :: ${cmd.slice(0, 48)}`, () => {
      assert.equal(denied(runGuard(cmd)), false, `must ALLOW a read of a consent path: ${cmd}`);
    });
  }
});
