// Tests for branch resolution on an unborn HEAD.
// Spec: docs/specs/unborn-branch-consent-blindness.md
//
// The defect: currentBranch() shelled `git rev-parse --abbrev-ref HEAD`, which
// exits 128 before a repository's first commit. The catch returned null, the
// guard read that as "not a git repo", and every branch check was skipped on the
// one commit whose branch policy is least recoverable.
//
// tests/branch-aware-git-policy.test.mjs seeds an empty commit into every sandbox
// to dodge that exit — its own comment calls the unborn branch "a separate failure
// mode". Here the seed commit is a parameter, which is what makes the before/after
// parity assertion possible.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { currentBranch } from '../.claude/hooks/lib/common.mjs';
import { decide } from '../.claude/hooks/branch_guard.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GUARD_REL = '.claude/hooks/git_commit_guard.mjs';
const HOOK_DEPS = [
  GUARD_REL,
  '.claude/hooks/lib/common.mjs',
  '.claude/hooks/lib/glob-match.mjs',
  '.claude/hooks/lib/closure-check.mjs',
  '.claude/hooks/lib/consent-decision.mjs',
  '.claude/hooks/lib/slug.mjs',
  // closure-check.mjs imports it. A lib the spawned guard needs but the sandbox
  // omits kills the guard on ERR_MODULE_NOT_FOUND, and its empty stdout reads as
  // ALLOW — a fail-open that silently passes every deny assertion below.
  '.claude/hooks/lib/frontmatter-parser.mjs',
];

const PROTECT_MAIN = {
  consent: { commit_ttl_seconds: 900 },
  git: { protected_branches: ['main'], branch_pattern: null },
};

const TEMP_DIRS = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'unborn-'));
  TEMP_DIRS.push(dir);
  return dir;
}

function git(root, ...args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function initRepo(root, branch) {
  git(root, 'init', '-q', '-b', branch);
}

function commitEmpty(root) {
  git(root, '-c', 'user.email=test@test', '-c', 'user.name=Test',
      'commit', '--allow-empty', '-q', '--no-gpg-sign', '-m', 'seed');
}

function detach(root) {
  git(root, 'checkout', '-q', '--detach', git(root, 'rev-parse', 'HEAD').stdout.trim());
}

// A sandbox is a temp CLAUDE_PROJECT_DIR holding copies of the hook and its
// imports, so policy config and consent state stay isolated from this repo.
function buildSandbox({ project = PROTECT_MAIN, gitInit = true, seedCommit = true, branch = 'main' } = {}) {
  const root = tempDir();
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state/logs'), { recursive: true });
  for (const rel of HOOK_DEPS) cpSync(join(REPO_ROOT, rel), join(root, rel));
  writeFileSync(join(root, '.claude/project.json'), JSON.stringify(project, null, 2));
  if (gitInit) initRepo(root, branch);
  if (gitInit && seedCommit) commitEmpty(root);
  return root;
}

function grantConsent(root) {
  writeFileSync(join(root, '.claude/state/commit_consent'), `${Math.floor(Date.now() / 1000)}\n`);
}

function runGuard(root, command = 'git commit -m test') {
  const res = spawnSync('node', [join(root, GUARD_REL)], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  let parsed = {};
  try { parsed = JSON.parse(res.stdout || '{}'); } catch {}
  const out = parsed?.hookSpecificOutput ?? {};
  return { decision: out.permissionDecision ?? 'allow', reason: out.permissionDecisionReason ?? '' };
}

after(() => {
  for (const dir of TEMP_DIRS) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

describe('AC-001, AC-002, AC-003 — §Behavior #1 commit policy on an unborn branch', () => {
  it('test_when_unborn_protected_branch_and_commit_then_denies', () => {
    const root = buildSandbox({ seedCommit: false });
    const r = runGuard(root);
    assert.equal(r.decision, 'deny', `expected deny on unborn main; got ${r.decision}`);
    assert.match(r.reason, /grant-commit/);
  });

  it('test_when_unborn_protected_branch_and_fresh_consent_then_allows', () => {
    const root = buildSandbox({ seedCommit: false });
    grantConsent(root);
    const r = runGuard(root);
    assert.equal(r.decision, 'allow', `expected allow with fresh consent; reason=${r.reason}`);
  });

  it('test_when_same_repo_before_and_after_first_commit_then_decision_identical', () => {
    const root = buildSandbox({ seedCommit: false });
    const unborn = runGuard(root);
    commitEmpty(root);
    const born = runGuard(root);
    assert.deepStrictEqual(unborn, born, 'the first commit must not change the guard decision');
  });

  it('test_when_detached_head_and_commit_then_denies', () => {
    const root = buildSandbox();
    detach(root);
    const r = runGuard(root);
    assert.equal(r.decision, 'deny');
    assert.match(r.reason, /detached HEAD/);
  });

  it('test_when_born_branch_off_protected_glob_and_commit_then_allows', () => {
    const root = buildSandbox({ branch: 'feat/foo' });
    const r = runGuard(root);
    assert.equal(r.decision, 'allow', `expected allow on unprotected branch; reason=${r.reason}`);
  });
});

describe('AC-004 — §Behavior #2 no git work tree', () => {
  it('test_when_not_a_git_work_tree_and_commit_then_allows', () => {
    const root = buildSandbox({ gitInit: false });
    assert.equal(runGuard(root).decision, 'allow');
    assert.equal(currentBranch(root), null);
  });
});

describe('AC-001, AC-003, AC-004 — currentBranch, the resolver contract', () => {
  it('test_when_current_branch_probed_directly_then_returns_name_head_or_null', () => {
    const unborn = tempDir();
    initRepo(unborn, 'main');
    assert.equal(currentBranch(unborn), 'main');

    const detached = tempDir();
    initRepo(detached, 'main');
    commitEmpty(detached);
    detach(detached);
    assert.equal(currentBranch(detached), 'HEAD');

    assert.equal(currentBranch(tempDir()), null);
  });

  it('test_when_unborn_branch_name_has_slash_then_resolves_full_name', () => {
    const root = tempDir();
    initRepo(root, 'feat/x');
    assert.equal(currentBranch(root), 'feat/x');
  });
});

describe('AC-005 — single-sourcing, the guard holds no second copy', () => {
  it('test_when_guard_source_parsed_then_branch_predicates_are_imported', () => {
    const src = readFileSync(join(REPO_ROOT, GUARD_REL), 'utf8');
    assert.doesNotMatch(src, /^\s*function\s+currentBranch\s*\(/m, 'guard must not declare its own currentBranch');
    assert.doesNotMatch(src, /^\s*function\s+isInsideWorkTree\s*\(/m, 'guard must not declare its own isInsideWorkTree');

    const importBlock = src.match(/import\s*\{([\s\S]*?)\}\s*from\s*'\.\/lib\/common\.mjs'/);
    assert.ok(importBlock, 'guard must import from ./lib/common.mjs');
    assert.match(importBlock[1], /\bcurrentBranch\b/);
    assert.match(importBlock[1], /\bisInsideWorkTree\b/);
  });
});

describe('AC-006 — §Behavior #3 work-start gate inherits the fix', () => {
  it('test_when_branch_guard_decides_on_unborn_release_branch_then_denies', () => {
    const root = tempDir();
    initRepo(root, 'main');
    const d = decide({
      inScopeCreation: true,
      configured: true,
      model: 'github-flow',
      isPrimary: true,
      branch: currentBranch(root),
      releaseBranches: ['main'],
    });
    assert.equal(d.allow, false, 'unborn release branch must still block work-start');
    assert.match(d.message, /feature branch/);
  });
});

describe('AC-007 — genesis amendment', () => {
  it('test_when_seed_docs_read_then_both_name_symbolic_ref', () => {
    for (const rel of ['docs/init/seed.md', 'src/seed.template.md']) {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      const paragraph = text.match(/\*\*Branch-aware consent policy\.\*\*[\s\S]*?\n\n/);
      assert.ok(paragraph, `${rel} must carry the branch-aware consent policy paragraph`);
      assert.match(paragraph[0], /symbolic-ref --short HEAD/, `${rel} must name the shipped branch read`);
      assert.match(paragraph[0], /unborn/, `${rel} must state the unborn-branch case`);
      assert.doesNotMatch(paragraph[0], /rev-parse --abbrev-ref HEAD/, `${rel} must not still name the old branch read`);
    }
  });
});
