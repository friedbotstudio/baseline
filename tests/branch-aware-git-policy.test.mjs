// Tests for the branch-aware git consent policy + /grant-push gate.
// Spec: docs/specs/branch-aware-git-policy.md
//
// Drives the JS-piloted hooks (git_commit_guard.mjs, consent_gate_grant.mjs)
// via spawnSync with synthetic stdin payloads. Verifies §Behavior #1-#6.
//
// The tests run against a temp CLAUDE_PROJECT_DIR (NOT this repo's live dir)
// so policy configuration and consent state are deterministic and isolated.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GUARD = join(REPO_ROOT, '.claude/hooks/git_commit_guard.mjs');
const GRANT = join(REPO_ROOT, '.claude/hooks/consent_gate_grant.mjs');
const LIB   = join(REPO_ROOT, '.claude/hooks/lib/common.mjs');

// Build a temp CLAUDE_PROJECT_DIR with copies of the hooks + a writable
// project.json + state dir. Returns the temp path.
function buildSandbox(projectJson) {
  const root = mkdtempSync(join(tmpdir(), 'bagp-'));
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state/logs'), { recursive: true });
  cpSync(LIB, join(root, '.claude/hooks/lib/common.mjs'));
  cpSync(GUARD, join(root, '.claude/hooks/git_commit_guard.mjs'));
  cpSync(GRANT, join(root, '.claude/hooks/consent_gate_grant.mjs'));
  writeFileSync(join(root, '.claude/project.json'), JSON.stringify(projectJson, null, 2));
  // Mark as a git repo so isInsideWorkTree() returns true.
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  // Create an initial commit so HEAD is born (avoids "ambiguous HEAD" on rev-parse
  // for the unborn-branch case, which is a separate failure mode from detached HEAD).
  spawnSync('git', ['-C', root, '-c', 'user.email=test@test', '-c', 'user.name=Test',
                    'commit', '--allow-empty', '-q', '-m', 'seed', '--no-gpg-sign'], { stdio: 'ignore' });
  return root;
}

function setBranch(root, branchName) {
  spawnSync('git', ['-C', root, 'checkout', '-q', '-B', branchName], { stdio: 'ignore' });
}

function detach(root) {
  // HEAD is already born from buildSandbox's seed commit; just detach onto its SHA.
  const sha = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  spawnSync('git', ['-C', root, 'checkout', '-q', '--detach', sha], { stdio: 'ignore' });
}

// Run guard.mjs with payload on stdin; return { code, stdout, stderr, decision }.
function runGuard(root, payload) {
  const res = spawnSync('node', [join(root, '.claude/hooks/git_commit_guard.mjs')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  let decision;
  try {
    const parsed = JSON.parse(res.stdout || '{}');
    decision = parsed?.hookSpecificOutput?.permissionDecision || 'allow';
  } catch {
    decision = 'allow';
  }
  return {
    code: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
    decision,
    reason: (() => {
      try { return JSON.parse(res.stdout)?.hookSpecificOutput?.permissionDecisionReason || ''; }
      catch { return ''; }
    })(),
  };
}

function runGrant(root, prompt) {
  const res = spawnSync('node', [join(root, '.claude/hooks/consent_gate_grant.mjs')], {
    input: JSON.stringify({ prompt }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

function writeConsent(root, name, epoch) {
  writeFileSync(join(root, '.claude/state', name), `${epoch}\n`);
}

const SANDBOXES = [];
function sb(cfg) {
  const r = buildSandbox(cfg);
  SANDBOXES.push(r);
  return r;
}

after(() => {
  for (const r of SANDBOXES) {
    try { rmSync(r, { recursive: true, force: true }); } catch {}
  }
});

describe('§Behavior #1 — commit policy', () => {
  it('test_when_protected_branches_null_and_commit_then_requires_consent', () => {
    const root = sb({ consent: { commit_ttl_seconds: 300, gate_marker_ttl_seconds: 120 }, git: { protected_branches: null, branch_pattern: null } });
    setBranch(root, 'main');
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git commit -m test' } });
    assert.equal(r.decision, 'deny', `expected deny; got ${r.decision} reason=${r.reason}`);
    assert.match(r.reason, /grant-commit/, 'reason should mention /grant-commit');
  });

  it('test_when_glob_excludes_branch_and_commit_then_allows', () => {
    const root = sb({ consent: { commit_ttl_seconds: 300 }, git: { protected_branches: ['main'], branch_pattern: null } });
    setBranch(root, 'feat/foo');
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git commit -m test' } });
    assert.equal(r.decision, 'allow', `expected allow; got ${r.decision} reason=${r.reason}`);
  });

  it('test_when_glob_includes_branch_and_fresh_consent_then_allows', () => {
    const root = sb({ consent: { commit_ttl_seconds: 300 }, git: { protected_branches: ['main'], branch_pattern: null } });
    setBranch(root, 'main');
    writeConsent(root, 'commit_consent', Math.floor(Date.now() / 1000));
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git commit -m test' } });
    assert.equal(r.decision, 'allow', `expected allow; got ${r.decision} reason=${r.reason}`);
  });

  it('test_when_feat_star_glob_protects_feature_branches_and_commit_then_requires_consent', () => {
    const root = sb({ consent: { commit_ttl_seconds: 300 }, git: { protected_branches: ['main', 'feat/*'], branch_pattern: null } });
    setBranch(root, 'feat/widget');
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git commit -m test' } });
    assert.equal(r.decision, 'deny', `expected deny; got ${r.decision} reason=${r.reason}`);
  });

  it('test_when_branch_pattern_set_and_off_pattern_branch_then_denies_commit', () => {
    const root = sb({ consent: {}, git: { protected_branches: ['main'], branch_pattern: '^(feat|fix|chore|docs)/[a-z0-9-]+$' } });
    setBranch(root, 'random-name');
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git commit -m test' } });
    assert.equal(r.decision, 'deny', `expected deny; got ${r.decision} reason=${r.reason}`);
    assert.match(r.reason, /branch_pattern/, 'reason should mention branch_pattern');
  });

  it('test_when_branch_pattern_null_then_any_branch_name_allowed', () => {
    const root = sb({ consent: {}, git: { protected_branches: ['main'], branch_pattern: null } });
    setBranch(root, 'random-name');
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git commit -m test' } });
    assert.equal(r.decision, 'allow', `expected allow; got ${r.decision} reason=${r.reason}`);
  });
});

describe('§Behavior #2 — push policy', () => {
  it('test_when_protected_branches_null_and_push_then_requires_push_consent', () => {
    const root = sb({ consent: { push_ttl_seconds: 300 }, git: { protected_branches: null, branch_pattern: null } });
    setBranch(root, 'main');
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git push origin main' } });
    assert.equal(r.decision, 'deny', `expected deny; got ${r.decision} reason=${r.reason}`);
    assert.match(r.reason, /grant-push/, 'reason should mention /grant-push');
  });

  it('test_when_glob_excludes_branch_and_push_then_allows', () => {
    const root = sb({ consent: {}, git: { protected_branches: ['main'], branch_pattern: null } });
    setBranch(root, 'feat/foo');
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git push origin feat/foo' } });
    assert.equal(r.decision, 'allow', `expected allow; got ${r.decision} reason=${r.reason}`);
  });

  it('test_when_fresh_push_consent_on_protected_branch_then_allows', () => {
    const root = sb({ consent: { push_ttl_seconds: 300 }, git: { protected_branches: ['main'], branch_pattern: null } });
    setBranch(root, 'main');
    writeConsent(root, 'push_consent', Math.floor(Date.now() / 1000));
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git push origin main' } });
    assert.equal(r.decision, 'allow', `expected allow; got ${r.decision} reason=${r.reason}`);
  });
});

describe('§Behavior #5 — detached HEAD refusal', () => {
  it('test_when_detached_HEAD_and_commit_then_denies_with_explicit_error', () => {
    const root = sb({ consent: {}, git: { protected_branches: null, branch_pattern: null } });
    detach(root);
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git commit -m test' } });
    assert.equal(r.decision, 'deny', `expected deny; got ${r.decision} reason=${r.reason}`);
    assert.match(r.reason, /detached HEAD/i, 'reason should explicitly mention detached HEAD');
  });

  it('test_when_detached_HEAD_and_push_then_denies_with_explicit_error', () => {
    const root = sb({ consent: {}, git: { protected_branches: null, branch_pattern: null } });
    detach(root);
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git push origin HEAD' } });
    assert.equal(r.decision, 'deny', `expected deny; got ${r.decision} reason=${r.reason}`);
    assert.match(r.reason, /detached HEAD/i, 'reason should explicitly mention detached HEAD');
  });
});

describe('§Behavior #3 — /grant-push marker write', () => {
  it('test_when_grant_push_typed_then_marker_written_to_disk', () => {
    const root = sb({ consent: { gate_marker_ttl_seconds: 120 }, git: { protected_branches: null } });
    const r = runGrant(root, '/grant-push and push to main');
    assert.equal(r.code, 0, `expected exit 0; got ${r.code} stderr=${r.stderr}`);
    const markerPath = join(root, '.claude/state/.push_consent_grant');
    assert.ok(existsSync(markerPath), 'marker file should exist after /grant-push');
    const lines = readFileSync(markerPath, 'utf8').split('\n');
    assert.match(lines[0], /^\d+$/, 'line 1 should be epoch');
    assert.match(lines[1] || '', /and push to main/, 'line 2 should contain the note');
  });
});

describe('§Behavior #4 — write-gate on push_consent', () => {
  it('test_when_claude_writes_push_consent_grant_directly_then_denies', () => {
    const root = sb({ consent: {}, git: {} });
    const r = runGuard(root, { tool_name: 'Write', tool_input: { file_path: join(root, '.claude/state/.push_consent_grant') } });
    assert.equal(r.decision, 'deny', `expected deny; got ${r.decision} reason=${r.reason}`);
    assert.match(r.reason, /consent marker/i, 'reason should mention consent marker forgery');
  });

  it('test_when_no_marker_and_write_push_consent_then_denies', () => {
    const root = sb({ consent: { gate_marker_ttl_seconds: 120 }, git: {} });
    const r = runGuard(root, { tool_name: 'Write', tool_input: { file_path: join(root, '.claude/state/push_consent') } });
    assert.equal(r.decision, 'deny', `expected deny; got ${r.decision} reason=${r.reason}`);
  });

  it('test_when_fresh_marker_and_write_push_consent_then_allows_and_consumes_marker', () => {
    const root = sb({ consent: { gate_marker_ttl_seconds: 120 }, git: {} });
    // Simulate the UserPromptSubmit hook having written the marker.
    const markerPath = join(root, '.claude/state/.push_consent_grant');
    writeFileSync(markerPath, `${Math.floor(Date.now() / 1000)}\n`);
    const r = runGuard(root, { tool_name: 'Write', tool_input: { file_path: join(root, '.claude/state/push_consent') } });
    assert.equal(r.decision, 'allow', `expected allow; got ${r.decision} reason=${r.reason}`);
    assert.equal(existsSync(markerPath), false, 'marker should be deleted (single-use)');
  });
});

describe('§Behavior #6 — config defaults (backward-compat)', () => {
  it('test_when_git_block_absent_then_treats_as_null_every_branch_protected', () => {
    const root = sb({ consent: { commit_ttl_seconds: 300 } /* no git block at all */ });
    setBranch(root, 'feat/anything');
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git commit -m test' } });
    assert.equal(r.decision, 'deny', `expected deny (every branch protected on missing git block); got ${r.decision}`);
  });

  it('test_when_consent_push_ttl_seconds_absent_then_uses_default_300', () => {
    const root = sb({ consent: { gate_marker_ttl_seconds: 120 } /* no push_ttl_seconds */, git: { protected_branches: ['main'] } });
    setBranch(root, 'main');
    // Write a consent token aged 100s (well within default 300s).
    writeConsent(root, 'push_consent', Math.floor(Date.now() / 1000) - 100);
    const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: 'git push origin main' } });
    assert.equal(r.decision, 'allow', `expected allow with 100s-old consent under default 300s TTL; got ${r.decision} reason=${r.reason}`);
  });
});

describe('regression — retained FORBIDDEN_RE hard-blocks', () => {
  const cases = [
    ['git commit --amend',          'deny',  /amend/i],
    ['git commit -m foo --no-verify', 'deny', /no-verify/i],
    ['git reset --hard',            'deny',  /reset/i],
    ['git add -A',                  'deny',  /forbidden/i],
    ['git add .',                   'deny',  /forbidden/i],
    ['git config user.email a@b',   'deny',  /config/i],
    // NOT in the forbidden set anymore (branch policy decides):
    ['git push',                    null,    null],  // outcome depends on branch policy, but it's not the unconditional FORBIDDEN_RE deny
  ];
  for (const [cmd, expectedDecision, expectedReasonPattern] of cases) {
    it(`test_when_command_${cmd.replace(/\W+/g, '_')}_then_classified_correctly`, () => {
      const root = sb({ consent: {}, git: { protected_branches: [], branch_pattern: null } });
      setBranch(root, 'feat/foo');
      const r = runGuard(root, { tool_name: 'Bash', tool_input: { command: cmd } });
      if (expectedDecision === 'deny') {
        assert.equal(r.decision, 'deny', `${cmd}: expected deny; got ${r.decision}`);
        if (expectedReasonPattern) assert.match(r.reason, expectedReasonPattern, `${cmd}: reason mismatch`);
      } else {
        // `git push` on unprotected branch ([] = nothing protected) should now ALLOW.
        assert.equal(r.decision, 'allow', `${cmd}: expected allow (no longer FORBIDDEN_RE-blocked); got ${r.decision} reason=${r.reason}`);
      }
    });
  }
});
