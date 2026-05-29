// Workflow-extension-via-workflows-json — audit-baseline gate post-amendment
//
// After the §17 amendment lands (with the four-way Article IV mirror, the
// workflows.jsonl + schemas/ NEVER_TOUCH wiring, and the audit-baseline
// updates that validate workflows.jsonl), `bash .claude/skills/audit-
// baseline/audit.sh` must continue to exit 0 against the live dev-repo
// state. This is the integration gate that catches mirror drift, schema
// violations, and skill-hash mismatch in one place.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

async function cloneAndBuild() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-post-amendment-'));
  const rsyncResult = spawnSync(
    'rsync',
    [
      '-a',
      '--exclude=node_modules',
      '--exclude=obj',
      '--exclude=.git',
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

describe('audit-baseline post-amendment (SP-007 + SP-010)', () => {
  let tmp;
  before(async () => {
    tmp = await cloneAndBuild();
  });
  after(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it('test_when_audit_baseline_runs_post_amendment_then_exits_zero', async () => {
    const auditResult = spawnSync(
      'node',
      [path.join(tmp, '.claude/skills/audit-baseline/audit.mjs')],
      { env: { ...process.env, CLAUDE_PROJECT_DIR: tmp }, encoding: 'utf8' }
    );
    assert.equal(
      auditResult.status,
      0,
      `audit-baseline post-amendment must exit 0. stderr:\n${auditResult.stderr}\nstdout tail:\n${auditResult.stdout.split('\n').slice(-15).join('\n')}`
    );
    assert.match(
      auditResult.stdout,
      /overall\s+PASS/i,
      'audit output must contain "overall PASS" line'
    );
  });
});
