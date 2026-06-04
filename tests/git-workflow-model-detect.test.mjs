// Tests for detectWorkflowModel + resolveWorkflowModel + isPrimaryWorkTree in
// hooks/lib/common.mjs. Spec: docs/specs/git-workflow-topology-model.md
// (§Behavior #1 resolution, #5 worktree primitive, #7 detection).
//
// Pure-function unit tests over injected signal fixtures — no live `gh`/network.
// Namespace import so a missing export surfaces as a clear assertion failure
// rather than a module link error.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as common from '../.claude/hooks/lib/common.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TMP = [];
after(() => { for (const d of TMP) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } } });

describe('resolveWorkflowModel — §Behavior #1', () => {
  it('test_when_canonical_values_then_identity', () => {
    assert.equal(common.resolveWorkflowModel('direct-to-main'), 'direct-to-main');
    assert.equal(common.resolveWorkflowModel('github-flow'), 'github-flow');
    assert.equal(common.resolveWorkflowModel('ask'), 'ask');
  });

  it('test_when_reserved_values_then_ask', () => {
    assert.equal(common.resolveWorkflowModel('gitflow'), 'ask');
    assert.equal(common.resolveWorkflowModel('trunk'), 'ask');
  });

  it('test_when_absent_or_unknown_or_wrongcase_then_ask', () => {
    assert.equal(common.resolveWorkflowModel(undefined), 'ask');
    assert.equal(common.resolveWorkflowModel(null), 'ask');
    assert.equal(common.resolveWorkflowModel(''), 'ask');
    assert.equal(common.resolveWorkflowModel('DIRECT-TO-MAIN'), 'ask');
    assert.equal(common.resolveWorkflowModel('nonsense'), 'ask');
    assert.equal(common.resolveWorkflowModel(42), 'ask');
  });
});

describe('isPrimaryWorkTree — §Behavior #5', () => {
  it('test_when_primary_tree_then_true', () => {
    // This repo root is a primary work tree.
    assert.equal(common.isPrimaryWorkTree(REPO_ROOT), true);
  });

  it('test_when_linked_worktree_then_false', () => {
    const wt = mkdtempSync(join(tmpdir(), 'gwm-wt-'));
    rmSync(wt, { recursive: true, force: true });
    const r = spawnSync('git', ['-C', REPO_ROOT, 'worktree', 'add', '-q', '--detach', wt, 'HEAD'], { encoding: 'utf8' });
    assert.equal(r.status, 0, `worktree add failed: ${r.stderr}`);
    try {
      assert.equal(common.isPrimaryWorkTree(wt), false, 'linked worktree should not be primary');
    } finally {
      spawnSync('git', ['-C', REPO_ROOT, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' });
      spawnSync('git', ['-C', REPO_ROOT, 'worktree', 'prune'], { stdio: 'ignore' });
    }
  });

  it('test_when_not_a_git_dir_then_true_fail_toward_enforce', () => {
    const nogit = mkdtempSync(join(tmpdir(), 'gwm-nogit-'));
    TMP.push(nogit);
    assert.equal(common.isPrimaryWorkTree(nogit), true, 'git failure must fail toward enforcing (primary)');
  });
});

describe('detectWorkflowModel — §Behavior #7', () => {
  it('test_when_semantic_release_ci_push_main_next_then_direct_to_main', () => {
    const ciText = [
      'on:',
      '  push:',
      '    branches: [main, next]',
      'jobs:',
      '  release:',
      '    steps:',
      '      - run: npx semantic-release',
    ].join('\n');
    const out = common.detectWorkflowModel({ ciText });
    assert.equal(out.model, 'direct-to-main', `expected direct-to-main; got ${JSON.stringify(out)}`);
    assert.deepEqual(out.release_branches, ['main', 'next'], 'release_branches should be seeded from the push trigger');
  });

  it('test_when_gh_protection_requires_pr_reviews_then_github_flow', () => {
    const ghProtection = { required_pull_request_reviews: { required_approving_review_count: 1 } };
    const out = common.detectWorkflowModel({ ghProtection });
    assert.equal(out.model, 'github-flow', `expected github-flow; got ${JSON.stringify(out)}`);
  });

  it('test_when_no_signal_then_ask', () => {
    assert.equal(common.detectWorkflowModel({}).model, 'ask');
    assert.equal(common.detectWorkflowModel({ ciText: 'name: lint\non: [pull_request]\n' }).model, 'ask');
  });

  it('test_when_conflicting_signals_then_ask', () => {
    // semantic-release CI AND required PR reviews -> ambiguous -> ask.
    const ciText = 'on:\n  push:\n    branches: [main]\njobs:\n  release:\n    steps:\n      - run: npx semantic-release\n';
    const ghProtection = { required_pull_request_reviews: { required_approving_review_count: 2 } };
    assert.equal(common.detectWorkflowModel({ ciText, ghProtection }).model, 'ask');
  });

  it('test_when_read_failure_then_ask', () => {
    // Malformed inputs must not throw; total function flooring to ask.
    assert.equal(common.detectWorkflowModel(undefined).model, 'ask');
    assert.equal(common.detectWorkflowModel({ ciText: 12345, ghProtection: 'oops' }).model, 'ask');
  });
});
