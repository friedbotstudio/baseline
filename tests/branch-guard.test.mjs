// AC-002 (erp-portables slice B) — branch_guard PreToolUse hook.
//
// branch_guard blocks CREATION of .claude/state/workflow.json on a release
// branch under a PR-based git model (github-flow) and fails open otherwise.
// The decision is a pure exported `decide(inputs)`; main() gathers inputs and
// emits. We test the pure function across the spec's AC-002 matrix, the new
// `currentBranch()` common.mjs primitive it composes, and the governance
// lockstep (on disk + wired after track_guard + roster 27 reconciled).
//
// Run: node --test tests/branch-guard.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_HOOKS } from '../.claude/skills/audit-baseline/expected-baseline.mjs';
import * as common from '../.claude/hooks/lib/common.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

let decide;
try {
  ({ decide } = await import('../.claude/hooks/branch_guard.mjs'));
} catch (err) {
  throw new Error(
    `.claude/hooks/branch_guard.mjs is not importable (${err.message}) — ` +
    'slice B must create the hook with an exported pure decide()',
  );
}

const base = {
  inScopeCreation: true,
  configured: true,
  model: 'github-flow',
  isPrimary: true,
  branch: 'main',
  releaseBranches: ['main'],
};

describe('branch_guard.decide — AC-002 deny matrix', () => {
  it('test_when_release_branch_github_flow_creation_then_deny', () => {
    const d = decide({ ...base });
    assert.equal(d.allow, false);
    assert.match(d.message, /main/, 'reason names the offending branch');
    assert.match(d.message, /feature branch|git switch -c/i, 'reason names the remedy');
  });

  it('test_when_release_glob_matches_then_deny', () => {
    const d = decide({ ...base, branch: 'release/1.2', releaseBranches: ['main', 'release/*'] });
    assert.equal(d.allow, false);
  });

  it('test_when_release_branches_absent_or_empty_then_default_main', () => {
    assert.equal(decide({ ...base, releaseBranches: undefined }).allow, false);
    assert.equal(decide({ ...base, releaseBranches: [] }).allow, false);
  });
});

describe('branch_guard.decide — AC-002 fail-open matrix', () => {
  it('test_when_feature_branch_then_allow', () => {
    assert.equal(decide({ ...base, branch: 'feat/x' }).allow, true);
    assert.equal(decide({ ...base, branch: 'chore/y' }).allow, true);
  });

  it('test_when_not_in_scope_creation_then_allow', () => {
    assert.equal(decide({ ...base, inScopeCreation: false }).allow, true);
  });

  it('test_when_non_github_flow_model_then_allow', () => {
    assert.equal(decide({ ...base, model: 'direct-to-main' }).allow, true);
    assert.equal(decide({ ...base, model: 'ask' }).allow, true);
  });

  it('test_when_configured_false_then_allow', () => {
    assert.equal(decide({ ...base, configured: false }).allow, true);
  });

  it('test_when_non_git_or_detached_head_then_allow', () => {
    assert.equal(decide({ ...base, branch: null }).allow, true);
    assert.equal(decide({ ...base, branch: 'HEAD' }).allow, true);
  });

  it('test_when_linked_worktree_then_allow', () => {
    assert.equal(decide({ ...base, isPrimary: false }).allow, true);
  });
});

describe('currentBranch — lib/common.mjs primitive', () => {
  it('test_when_current_branch_called_then_contract_holds', () => {
    assert.equal(typeof common.currentBranch, 'function',
      'lib/common.mjs must export currentBranch()');
    const here = common.currentBranch(REPO_ROOT);
    assert.ok(typeof here === 'string' && here.length > 0,
      'in this git repo currentBranch() returns a non-empty string');
    const nonGit = mkdtempSync(join(tmpdir(), 'bg-nongit-'));
    try {
      assert.equal(common.currentBranch(nonGit), null,
        'in a non-git directory currentBranch() returns null');
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });
});

describe('branch_guard — governance lockstep (roster 27)', () => {
  it('test_when_governance_surfaces_then_hook_wired_and_counted', () => {
    const guardSrc = read('.claude/hooks/branch_guard.mjs');
    assert.match(guardSrc, /export function decide/, 'pure decide() is exported');

    for (const rel of ['.claude/settings.json', 'src/settings.template.json']) {
      const settings = read(rel);
      assert.match(settings, /branch_guard\.mjs/, `${rel} wires branch_guard`);
      assert.ok(
        settings.indexOf('track_guard.mjs') < settings.indexOf('branch_guard.mjs'),
        `${rel} wires branch_guard after track_guard`,
      );
    }

    const roster = read('.claude/skills/audit-baseline/expected-baseline.mjs');
    assert.match(roster, /'branch_guard'/, 'EXPECTED_HOOKS roster includes branch_guard');
    assert.equal(EXPECTED_HOOKS.size, 27, 'declared hook roster is 27');

    const claude = read('CLAUDE.md');
    assert.match(claude, new RegExp(`${EXPECTED_HOOKS.size} hooks`),
      'CLAUDE.md states the roster count');
    assert.match(claude, /`branch_guard`/, 'CLAUDE.md Article VIII table names branch_guard');

    // Read the RENDERED page, not the template. hooks.njk builds its roster from
    // a `{% for %}` over _data/roster.cjs, so no hook name appears in the source;
    // a template scan here would fail against a correct page.
    const rendered = read('obj/site/hooks/index.html');
    assert.match(rendered, /branch_guard/, 'docsite hooks page lists branch_guard');
  });
});
