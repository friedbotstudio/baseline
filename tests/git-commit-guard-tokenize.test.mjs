// Finding C / Q-003 — git_commit_guard must classify git subcommands by
// command SEGMENT, not naive substring. A read-only command that merely
// contains the text "git commit" (a grep, an echo, a string) must NOT be
// treated as a commit. RED until lib/common.mjs gains `gitSubcommandInvoked`
// and git_commit_guard.mjs uses it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(REPO_ROOT, '.claude/hooks/git_commit_guard.mjs');
const imp = () => import(join(REPO_ROOT, '.claude/hooks/lib/common.mjs'));

// ---- unit: gitSubcommandInvoked (the new segment-aware classifier) ----

describe('gitSubcommandInvoked — command-segment classification (Q-003)', () => {
  it('test_when_cmd_contains_git_commit_substring_in_grep_then_not_classified_commit', async () => {
    const { gitSubcommandInvoked } = await imp();
    assert.equal(gitSubcommandInvoked('grep -nE "x|git commit|y" file', 'commit'), false);
    assert.equal(gitSubcommandInvoked('echo "git commit"', 'commit'), false);
    assert.equal(gitSubcommandInvoked('# remember to git commit later', 'commit'), false);
  });

  it('test_when_actual_git_commit_then_classified_commit', async () => {
    const { gitSubcommandInvoked } = await imp();
    assert.equal(gitSubcommandInvoked('git commit -m x', 'commit'), true);
    assert.equal(gitSubcommandInvoked('FOO=bar git commit -m x', 'commit'), true);
    assert.equal(gitSubcommandInvoked('git -C /tmp/x commit -m y', 'commit'), true);
    assert.equal(gitSubcommandInvoked('cd /x && git commit -m z', 'commit'), true);
  });

  it('test_when_push_substring_vs_real_push_then_classified_correctly', async () => {
    const { gitSubcommandInvoked } = await imp();
    assert.equal(gitSubcommandInvoked('grep "git push" f', 'push'), false);
    assert.equal(gitSubcommandInvoked('git push origin main', 'push'), true);
  });

  // Security HIGH (docs/security/infra-hardening-2026-05-31.md): wrapped/executed
  // forms of `git commit`/`git push` MUST be classified — they really run git.
  it('test_when_git_commit_wrapped_in_executor_then_classified_commit', async () => {
    const { gitSubcommandInvoked } = await imp();
    assert.equal(gitSubcommandInvoked('sh -c "git commit -m x"', 'commit'), true);
    assert.equal(gitSubcommandInvoked("bash -c 'git commit -m x'", 'commit'), true);
    assert.equal(gitSubcommandInvoked('eval "git commit -m x"', 'commit'), true);
    assert.equal(gitSubcommandInvoked('command git commit -m x', 'commit'), true);
    assert.equal(gitSubcommandInvoked('env FOO=bar git commit', 'commit'), true);
  });

  it('test_when_git_commit_in_substitution_or_group_then_classified_commit', async () => {
    const { gitSubcommandInvoked } = await imp();
    assert.equal(gitSubcommandInvoked('echo $(git commit -m x)', 'commit'), true);
    assert.equal(gitSubcommandInvoked('echo `git commit -m x`', 'commit'), true);
    assert.equal(gitSubcommandInvoked('(git commit -m x)', 'commit'), true);
    assert.equal(gitSubcommandInvoked('{ git commit -m x; }', 'commit'), true);
  });

  it('test_when_git_push_wrapped_then_classified_push', async () => {
    const { gitSubcommandInvoked } = await imp();
    assert.equal(gitSubcommandInvoked('sh -c "git push origin main"', 'push'), true);
    assert.equal(gitSubcommandInvoked('bash -c "cd /x && git push"', 'push'), true);
  });

  it('test_when_line_continuation_splits_git_commit_then_classified_commit', async () => {
    const { gitSubcommandInvoked } = await imp();
    assert.equal(gitSubcommandInvoked('git \\\ncommit -m x', 'commit'), true);
  });

  // The Q-003 fix MUST survive the wrapper-aware pass: data (grep patterns,
  // echo strings, comments, quoted-but-not-executed) stays unclassified.
  it('test_when_wrapper_aware_pass_then_data_mentions_still_not_classified', async () => {
    const { gitSubcommandInvoked } = await imp();
    assert.equal(gitSubcommandInvoked('grep -nE "x|git commit|y" file', 'commit'), false);
    assert.equal(gitSubcommandInvoked('echo "git commit"', 'commit'), false);
    assert.equal(gitSubcommandInvoked('echo "sh -c \'git commit\'"', 'commit'), false);
    assert.equal(gitSubcommandInvoked('# remember to git commit later', 'commit'), false);
    assert.equal(gitSubcommandInvoked('grep "git push" f', 'push'), false);
    // A substitution inside SINGLE quotes is literal — shell does not execute it.
    assert.equal(gitSubcommandInvoked("echo 'run $(git commit) to commit'", 'commit'), false);
    assert.equal(gitSubcommandInvoked("for c in 'echo $(git commit)'; do :; done", 'commit'), false);
  });
});

// ---- guard-level integration: grep mentioning "git commit" is not blocked ----

function tempGitRepo() {
  const root = mkdtempSync(join(tmpdir(), 'gcg-'));
  const run = (args) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
  run(['init', '-q']);
  run(['config', 'user.email', 't@t']);
  run(['config', 'user.name', 't']);
  writeFileSync(join(root, 'f.txt'), 'x');
  run(['add', 'f.txt']);
  run(['commit', '-q', '-m', 'init']); // fixture commit (not via the guard)
  return root;
}

function runGuard(root, command) {
  return spawnSync('node', [GUARD], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });
}
const denied = (r) => /"permissionDecision"\s*:\s*"deny"|consent/i.test((r.stdout || '') + (r.stderr || ''));

describe('git_commit_guard — Bash classification by segment', () => {
  it('test_when_benign_cmd_mentions_git_commit_then_guard_allows', () => {
    const root = tempGitRepo(); // protected branch (master/main), no consent token
    try {
      // "git commit" is whitespace-bounded here (passes the guard's early
      // git-word check and the naive isCommit substring), but the leading
      // command is `echo`, not git. Currently denied (the bug); the
      // segment-aware classifier must ALLOW it.
      const r = runGuard(root, 'echo about to git commit the changes');
      assert.equal(denied(r), false, `a benign command merely mentioning "git commit" must NOT be denied.\nstdout:${r.stdout}\nstderr:${r.stderr}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_real_git_commit_no_consent_then_guard_denies', () => {
    const root = tempGitRepo();
    try {
      const r = runGuard(root, 'git commit -m "real commit"');
      assert.equal(denied(r), true, `an actual git commit with no consent on a protected branch must be denied.\nstdout:${r.stdout}\nstderr:${r.stderr}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  // Security HIGH fix: wrapper forms must NOT bypass consent.
  it('test_when_wrapped_git_commit_no_consent_then_guard_denies', () => {
    const root = tempGitRepo();
    try {
      for (const cmd of ['sh -c "git commit -m x"', 'eval "git commit -m x"', '(git commit -m x)', 'echo $(git commit -m x)']) {
        const r = runGuard(root, cmd);
        assert.equal(denied(r), true, `wrapped commit must be denied without consent: ${cmd}\nstdout:${r.stdout}\nstderr:${r.stderr}`);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_wrapped_forbidden_flag_then_guard_denies', () => {
    const root = tempGitRepo();
    try {
      const r = runGuard(root, 'sh -c "git commit --amend --no-verify"');
      assert.equal(denied(r), true, `wrapped forbidden flags (--amend/--no-verify) must be blocked.\nstdout:${r.stdout}\nstderr:${r.stderr}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
