// Slice T5 — release model in project.json, read by standup (debt-hardening-batch).
// RED until gather.mjs gains collectReleaseModel + gatherSync exposes releaseModel.
// Covers: AC-301 (present block surfaced), AC-302 (absent/unreadable → null +
// degraded 'no-release-model', never throws).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATHER = join(REPO_ROOT, '.claude/skills/standup/gather.mjs');

function tmpRoot(projectJson) {
  const root = mkdtempSync(join(tmpdir(), 'release-model-'));
  if (projectJson !== undefined) {
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(join(root, '.claude', 'project.json'), projectJson);
  }
  return root;
}

const RELEASE_BLOCK = {
  cicd_model: 'github-actions',
  release_branch: 'main',
  release_trigger: 'on-tag',
  release_cycle: 'sprint-based',
  consumer_upgrade_cadence: 'rare',
};

describe('T5 collectReleaseModel', () => {
  it('test_when_release_block_present_then_surfaced', async () => {
    const { collectReleaseModel } = await import(GATHER);
    const root = tmpRoot(JSON.stringify({ release: RELEASE_BLOCK }));
    const degraded = [];
    const model = collectReleaseModel(root, degraded);
    assert.equal(model.cicd_model, 'github-actions');
    assert.equal(model.release_trigger, 'on-tag');
    assert.ok(!degraded.includes('no-release-model'));
  });

  it('test_when_release_block_absent_then_null_and_degraded', async () => {
    const { collectReleaseModel } = await import(GATHER);
    const root = tmpRoot(JSON.stringify({ configured: true }));
    const degraded = [];
    const model = collectReleaseModel(root, degraded);
    assert.equal(model, null);
    assert.ok(degraded.includes('no-release-model'));
  });

  it('test_when_config_unreadable_then_no_throw', async () => {
    const { collectReleaseModel } = await import(GATHER);
    const degraded = [];
    // missing project.json entirely
    assert.equal(collectReleaseModel(tmpRoot(undefined), degraded), null);
    // malformed json
    const model = collectReleaseModel(tmpRoot('{ not valid json'), degraded);
    assert.equal(model, null);
    assert.ok(degraded.filter((d) => d === 'no-release-model').length >= 1);
  });
});

describe('T5 gatherSync exposes releaseModel', () => {
  it('test_when_gathersync_then_has_releaseModel_field', async () => {
    const { gatherSync } = await import(GATHER);
    const out = gatherSync({ rootDir: REPO_ROOT });
    assert.ok('releaseModel' in out, 'gatherSync return shape includes releaseModel');
    // existing fields remain
    for (const k of ['release', 'backlog', 'pendingQuestions', 'roadmap', 'degraded']) {
      assert.ok(k in out, `existing field ${k} preserved`);
    }
  });
});
