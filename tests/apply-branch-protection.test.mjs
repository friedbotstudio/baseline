import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, '.github/branch-protection/main.json');
const APPLIER_PATH = join(ROOT, 'scripts/ci/apply-branch-protection.mjs');
const AUTO_MERGE_PATH = join(ROOT, '.github/workflows/auto-merge.yml');

async function importApplier() {
  return import(APPLIER_PATH);
}

describe('ci-posture — branch protection config-as-code (AC-010)', () => {
  it('test_branch_protection_config_pins_live_release_contexts', () => {
    assert.ok(existsSync(CONFIG_PATH), '.github/branch-protection/main.json must exist');
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    assert.ok(
      Array.isArray(config.required_status_checks?.contexts),
      'required_status_checks.contexts must be an array',
    );
    assert.ok(
      config.required_status_checks.contexts.includes('pre-publish-checks'),
      'contexts must pin pre-publish-checks — the gate job re-derived from this repo\'s live release.yml',
    );
    assert.equal(
      config.enforce_admins,
      false,
      'enforce_admins must stay false — this repo runs direct-to-main; admin pushes must not brick',
    );
    assert.equal(config.allow_force_pushes, false, 'force pushes stay blocked');
    assert.equal(config.allow_deletions, false, 'branch deletion stays blocked');
  });

  it('test_applier_subset_asserts_against_observed_contexts', async () => {
    const { assertContextsSubset } = await importApplier();
    assert.equal(typeof assertContextsSubset, 'function', 'applier must export assertContextsSubset');
    assert.doesNotThrow(() =>
      assertContextsSubset(['pre-publish-checks'], ['pre-publish-checks', 'release', 'deploy-pages']),
    );
    assert.throws(
      () => assertContextsSubset(['nonexistent-check'], ['pre-publish-checks']),
      /nonexistent-check/,
      'a required context absent from green main must fail loud, naming the missing context',
    );
  });

  it('test_applier_refuses_placeholder_config', async () => {
    const { validateConfig, PLACEHOLDER_MARKER } = await importApplier();
    assert.equal(typeof validateConfig, 'function', 'applier must export validateConfig');
    assert.equal(typeof PLACEHOLDER_MARKER, 'string', 'applier must export PLACEHOLDER_MARKER');
    const placeholderConfig = {
      required_status_checks: { strict: false, contexts: [PLACEHOLDER_MARKER] },
      enforce_admins: false,
      allow_force_pushes: false,
      allow_deletions: false,
    };
    assert.throws(
      () => validateConfig(placeholderConfig),
      new RegExp(PLACEHOLDER_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'the consumer fill-in placeholder must never be applied verbatim',
    );
    const realConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    assert.doesNotThrow(() => validateConfig(realConfig), 'the repo\'s own config must validate');
  });
});

describe('ci-posture — auto-merge workflow (AC-010)', () => {
  it('test_auto_merge_workflow_supplies_pr_context_and_gates_on_classifier', () => {
    assert.ok(existsSync(AUTO_MERGE_PATH), '.github/workflows/auto-merge.yml must exist');
    const src = readFileSync(AUTO_MERGE_PATH, 'utf8');
    assert.match(src, /pull_request/, 'auto-merge must trigger on pull_request');
    assert.match(
      src,
      /^\s{2}pre-publish-checks:/m,
      'must define a job named pre-publish-checks so the required context is satisfiable on PRs (release.yml is push-only)',
    );
    assert.match(src, /npm run publish:check/, 'the PR-context job must run the same gate as release.yml');
    assert.match(src, /low-risk-classifier\.mjs/, 'must invoke the classifier over the PR diff');
    assert.match(src, /gh pr merge --auto/, 'must enable auto-merge via gh, not merge directly');
  });

  it('test_auto_merge_workflow_pins_all_actions_to_40char_shas', () => {
    const src = readFileSync(AUTO_MERGE_PATH, 'utf8');
    const usesLines = src.split('\n').filter((l) => /^\s*(?:-\s+)?uses:/.test(l));
    assert.ok(usesLines.length > 0, 'workflow must use at least one action (harden-runner + checkout)');
    for (const line of usesLines) {
      assert.match(
        line,
        /@[0-9a-f]{40}(\s|$)/,
        `every uses: must be pinned to a 40-char SHA (runbook Rule 1): ${line.trim()}`,
      );
    }
  });
});
