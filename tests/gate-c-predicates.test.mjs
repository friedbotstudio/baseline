// AC-003 (erp-portables slice C) — branch-aware gate C predicates.
//
// lib/common.mjs gains pure computeProtectedBranch / computeAutonomousFeatureLanding
// plus live wrappers isProtectedBranch / isAutonomousFeatureLanding. Fail-safe
// direction: protected → true on any ambiguity; landing → false on any ambiguity.
// This repo declares direct-to-main with protected_branches null, so the live
// landing predicate must be false and seed-tasklist must still emit the
// grant-commit consent task (gate C byte-unchanged here — AC-003 regression trap).
//
// Run: node --test tests/gate-c-predicates.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as common from '../.claude/hooks/lib/common.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('computeProtectedBranch — pure fail-safe matrix', () => {
  it('test_when_branch_signals_ambiguous_then_computeProtectedBranch_true', () => {
    assert.equal(typeof common.computeProtectedBranch, 'function', 'common.mjs must export pure computeProtectedBranch');
    assert.equal(common.computeProtectedBranch({ branch: null, globs: ['main'] }), true, 'non-git (branch null) → protected');
    assert.equal(common.computeProtectedBranch({ branch: 'HEAD', globs: ['main'] }), true, 'detached HEAD → protected');
    assert.equal(common.computeProtectedBranch({ branch: 'feat/x', globs: null }), true, 'globs null → every branch protected');
    assert.equal(common.computeProtectedBranch({ branch: 'feat/x' }), true, 'globs absent → every branch protected');
    assert.equal(common.computeProtectedBranch({ branch: 'feat/x', globs: 'main' }), true, 'invalid globs type → fail-safe protected');
  });

  it('test_when_globs_list_given_then_membership_decides', () => {
    assert.equal(common.computeProtectedBranch({ branch: 'feat/x', globs: ['main'] }), false, 'feature branch outside globs → not protected');
    assert.equal(common.computeProtectedBranch({ branch: 'main', globs: ['main'] }), true, 'exact glob match → protected');
    assert.equal(common.computeProtectedBranch({ branch: 'release/1.2', globs: ['main', 'release/*'] }), true, 'wildcard glob match → protected');
  });
});

describe('computeAutonomousFeatureLanding — pure fail-safe matrix', () => {
  const clear = { model: 'github-flow', primary: true, branch: 'feat/x', releaseGlobs: ['main'], isProtected: false };

  it('test_when_any_landing_signal_fails_then_computeAutonomousFeatureLanding_false', () => {
    assert.equal(typeof common.computeAutonomousFeatureLanding, 'function', 'common.mjs must export pure computeAutonomousFeatureLanding');
    assert.equal(common.computeAutonomousFeatureLanding({ ...clear, model: 'ask' }), false, 'ask model → no autonomous landing');
    assert.equal(common.computeAutonomousFeatureLanding({ ...clear, model: 'direct-to-main' }), false, 'direct-to-main → no autonomous landing');
    assert.equal(common.computeAutonomousFeatureLanding({ ...clear, primary: false }), false, 'linked worktree → no autonomous landing');
    assert.equal(common.computeAutonomousFeatureLanding({ ...clear, branch: null }), false, 'non-git → no autonomous landing');
    assert.equal(common.computeAutonomousFeatureLanding({ ...clear, branch: 'HEAD' }), false, 'detached HEAD → no autonomous landing');
    assert.equal(common.computeAutonomousFeatureLanding({ ...clear, branch: 'main' }), false, 'release branch → no autonomous landing');
    assert.equal(common.computeAutonomousFeatureLanding({ ...clear, isProtected: true }), false, 'protected branch → no autonomous landing');
  });

  it('test_when_github_flow_nonprotected_feature_branch_then_landing_true', () => {
    assert.equal(common.computeAutonomousFeatureLanding({ ...clear }), true, 'github-flow + primary + named feature branch + not release + not protected → autonomous landing');
  });

  it('test_when_release_globs_absent_then_default_main', () => {
    const { releaseGlobs, ...rest } = clear;
    assert.equal(common.computeAutonomousFeatureLanding({ ...rest, branch: 'main' }), false, 'absent releaseGlobs default to [main]');
    assert.equal(common.computeAutonomousFeatureLanding({ ...rest }), true, 'feature branch still lands with defaulted releaseGlobs');
  });
});

describe('live wrappers — this repo (direct-to-main)', () => {
  it('test_when_this_repo_evaluated_live_then_landing_false_and_gate_c_unchanged', () => {
    assert.equal(typeof common.isAutonomousFeatureLanding, 'function', 'common.mjs must export live isAutonomousFeatureLanding');
    assert.equal(typeof common.isProtectedBranch, 'function', 'common.mjs must export live isProtectedBranch');
    assert.equal(common.isAutonomousFeatureLanding(), false, 'this repo declares direct-to-main → never autonomous');
    assert.equal(common.isProtectedBranch(), true, 'protected_branches null → every branch protected');
    const out = execFileSync(
      'node',
      [join(REPO_ROOT, '.claude/skills/triage/seed-tasklist.mjs'), 'epic-child', 'gatec-live-check'],
      { encoding: 'utf8', cwd: REPO_ROOT },
    );
    const tasks = JSON.parse(out);
    const gate = tasks.find((t) => t.needs_user === true && t.metadata?.phase === 'grant-commit');
    assert.ok(gate, 'grant-commit consent task must still be emitted in this repo (predicate false → node included)');
  });
});

describe('workflows.jsonl — grant-commit nodes carry the condition', () => {
  async function assertAnnotated(jsonlRelPath) {
    const validator = await import(join(REPO_ROOT, 'src/cli/workflows-validator.js'));
    const result = await validator.validateWorkflowsJsonl(join(REPO_ROOT, jsonlRelPath));
    assert.equal(result.ok, true, `${jsonlRelPath} must validate: ${JSON.stringify(result.errors)}`);
    const commitsTracks = result.tracks.filter((t) => t.invariants.includes('commits'));
    assert.ok(commitsTracks.length >= 5, `${jsonlRelPath}: expected at least 5 commits-invariant tracks`);
    for (const t of commitsTracks) {
      const gc = t.nodes.find((n) => n.needs_user === true && (n.id === 'grant-commit' || n.skill === 'grant-commit'));
      assert.ok(gc, `${jsonlRelPath} ${t.track_id}: grant-commit node stays DECLARED (I6)`);
      assert.deepEqual(
        gc.condition,
        { name: 'requires_commit_consent' },
        `${jsonlRelPath} ${t.track_id}: grant-commit node carries condition requires_commit_consent`,
      );
    }
  }

  it('test_when_repo_workflows_jsonl_validated_then_commits_tracks_grant_commit_annotated', async () => {
    await assertAnnotated('.claude/workflows.jsonl');
  });

  it('test_when_template_workflows_jsonl_validated_then_commits_tracks_grant_commit_annotated', async () => {
    await assertAnnotated('src/.claude/workflows.template.jsonl');
  });
});
