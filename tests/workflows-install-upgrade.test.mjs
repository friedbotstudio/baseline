// Workflow-extension-via-workflows-json — install + upgrade lifecycle
//
// .claude/workflows.jsonl and .claude/schemas/workflow-track.v1.json are
// declared NEVER_TOUCH (src/cli/install.js + scripts/build-manifest.mjs).
// Fresh install creates them from src/.claude/workflows.template.jsonl +
// src/.claude/schemas/. Upgrade preserves user-customized content verbatim.
// Pattern mirrors tests/skill-ownership.test.mjs: rsync clone → spawn build
// → spawn fresh install into tmpdir → assert tree shape.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

// Foundation: clone repo into tmpdir; build template; return tmp path.
async function cloneAndBuild() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'workflows-install-'));
  const rsyncResult = spawnSync(
    'rsync',
    [
      '-a',
      '--exclude=node_modules',
      '--exclude=obj',
      '--exclude=.git',
      // Claude Code's gitignored local state (~200MB on a dev machine); absent in
      // CI/normal checkouts, so this exclude is a no-op there and a clone speedup here.
      '--exclude=.config',
      '--exclude=docs/archive',
      '--exclude=.playwright-mcp',
      `${REPO_ROOT}/`,
      tmp,
    ],
    { encoding: 'utf8' }
  );
  if (rsyncResult.status !== 0) {
    throw new Error(`rsync failed: ${rsyncResult.stderr}`);
  }
  const buildResult = spawnSync('bash', [path.join(tmp, 'scripts/build-template.sh')], {
    env: { ...process.env, PKG_ROOT: tmp, CLAUDE_PROJECT_DIR: tmp },
    encoding: 'utf8',
  });
  if (buildResult.status !== 0) {
    throw new Error(`build failed: ${buildResult.stderr || buildResult.stdout}`);
  }
  return tmp;
}

async function freshInstallInto(srcRepo, targetDir) {
  return spawnSync(
    'node',
    [path.join(srcRepo, 'bin/cli.js'), targetDir, '--no-plantuml'],
    {
      env: { ...process.env, CREATE_BASELINE_TEMPLATE_DIR: path.join(srcRepo, 'obj/template') },
      encoding: 'utf8',
    }
  );
}

async function upgradeIn(srcRepo, targetDir) {
  return spawnSync(
    'node',
    [path.join(srcRepo, 'bin/cli.js'), 'upgrade', targetDir, '--no-plantuml'],
    {
      env: { ...process.env, CREATE_BASELINE_TEMPLATE_DIR: path.join(srcRepo, 'obj/template') },
      encoding: 'utf8',
    }
  );
}

describe('workflows install + upgrade lifecycle', () => {
  let srcRepo;
  before(async () => {
    srcRepo = await cloneAndBuild();
  });
  after(async () => {
    if (srcRepo) await fs.rm(srcRepo, { recursive: true, force: true });
  });

  it('test_when_clean_install_then_target_has_claude_workflows_jsonl_and_schemas_dir', async () => {
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'workflows-target-'));
    try {
      const result = await freshInstallInto(srcRepo, target);
      assert.equal(result.status, 0, `install failed: ${result.stderr || result.stdout}`);
      assert.ok(
        existsSync(path.join(target, '.claude/workflows.jsonl')),
        '.claude/workflows.jsonl must exist after fresh install'
      );
      assert.ok(
        existsSync(path.join(target, '.claude/schemas/workflow-track.v1.json')),
        '.claude/schemas/workflow-track.v1.json must exist after fresh install'
      );
      const jsonl = await fs.readFile(path.join(target, '.claude/workflows.jsonl'), 'utf8');
      const lines = jsonl.trim().split('\n').filter((l) => l.length > 0);
      assert.ok(lines.length >= 4, 'shipped workflows.jsonl has at least 4 tracks');
      for (const line of lines) {
        const track = JSON.parse(line);
        assert.ok(track.track_id, 'every line has a track_id');
        assert.ok(Array.isArray(track.nodes) && track.nodes.length >= 1, 'every track has nodes');
      }
    } finally {
      await fs.rm(target, { recursive: true, force: true });
    }
  });

  it('test_when_upgrade_runs_with_user_customized_workflows_jsonl_then_preserved', async () => {
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'workflows-target-upgrade-'));
    try {
      const installResult = await freshInstallInto(srcRepo, target);
      assert.equal(installResult.status, 0, `install failed: ${installResult.stderr || installResult.stdout}`);
      const customizedJsonl = '{"$schema":"./schemas/workflow-track.v1.json","track_id":"my-custom-track","name":"My custom track","description":"User-added; should survive upgrade","selectable":true,"selector_hints":["my custom workflow"],"preconditions":[],"invariants":[],"nodes":[{"id":"start","type":"task","skill":"intake","depends_on":[],"blocks":[],"can_parallel":false,"needs_user":false}]}\n';
      await fs.writeFile(path.join(target, '.claude/workflows.jsonl'), customizedJsonl);
      const upgradeResult = await upgradeIn(srcRepo, target);
      assert.ok(
        upgradeResult.status === 0 || upgradeResult.status === 3,
        `upgrade exit-status should be 0 (clean) or 3 (skipped-customizations); got ${upgradeResult.status}. stderr: ${upgradeResult.stderr}`
      );
      const afterUpgrade = await fs.readFile(path.join(target, '.claude/workflows.jsonl'), 'utf8');
      assert.equal(
        afterUpgrade,
        customizedJsonl,
        'user-customized workflows.jsonl must be preserved verbatim by NEVER_TOUCH_PRESERVE'
      );
    } finally {
      await fs.rm(target, { recursive: true, force: true });
    }
  });
});
