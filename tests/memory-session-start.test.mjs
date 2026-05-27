// Tests for the pending-upgrade-stage nag block added to
// .claude/hooks/memory_session_start.mjs per docs/specs/tier1-merge-option.md
// §Behavior #4 (AC-004) + §Behavior #8 (AC-008).
//
// Pattern: spawnSync the hook with CLAUDE_PROJECT_DIR pointing at a tmp tree
// seeded with .claude/memory/ + zero/one/many .claude/state/upgrade/<ts>/
// manifest.json files. Parse the hook's stdout JSON and assert against
// hookSpecificOutput.additionalContext via the additionalContextOf foundation
// helper (per scenario MEMORY.md convention).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const HOOK_PATH = join(REPO_ROOT, '.claude/hooks/memory_session_start.mjs');

// ---------- Foundation ----------

function additionalContextOf(result) {
  if (!result.stdout || !result.stdout.trim()) return '';
  const parsed = JSON.parse(result.stdout);
  return parsed?.hookSpecificOutput?.additionalContext || '';
}

function invokeHook(projectDir, payload = { source: 'startup' }) {
  return spawnSync('node', [HOOK_PATH], {
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectDir,
      CLAUDE_PROJECT_ROOT: projectDir,
    },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

async function seedMemoryDir(projectDir) {
  // The hook exits silently if .claude/memory/ is absent. Seeding the dir
  // is enough to reach the Python block; the canonical files are reported
  // as "missing" by the index and that is fine for these assertions.
  await mkdir(join(projectDir, '.claude/memory'), { recursive: true });
}

async function seedStage(projectDir, stageTs, entries) {
  const stageDir = join(projectDir, '.claude/state/upgrade', stageTs);
  await mkdir(stageDir, { recursive: true });
  const manifest = {
    stage_version: 1,
    slug: 'fixture',
    created_at: new Date().toISOString(),
    baseline_version_from: '0.7.0',
    baseline_version_to: '0.8.0',
    files: entries.map((e) => ({
      rel: e.rel,
      base_sha256: e.base_sha256 ?? null,
      incoming_sha256: e.incoming_sha256 ?? 'b'.repeat(64),
      local_sha256: e.local_sha256 ?? 'c'.repeat(64),
      status: e.status ?? 'PENDING',
    })),
  };
  await writeFile(join(stageDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

async function seedWorkflowJson(projectDir, slug = 'fixture-active') {
  await mkdir(join(projectDir, '.claude/state'), { recursive: true });
  await writeFile(
    join(projectDir, '.claude/state/workflow.json'),
    JSON.stringify(
      { request: 'x', slug, track_id: 'intake-full', completed: [], exceptions: [] },
      null,
      2,
    ),
  );
}

// ---------- Domain ----------

async function makeProject() {
  const projectDir = await mkdtemp(join(tmpdir(), 'tier1-merge-hook-'));
  await seedMemoryDir(projectDir);
  return projectDir;
}

// ---------- Tests ----------

describe('memory_session_start — pending upgrade stage nag (AC-004, AC-008)', () => {
  it('test_when_session_start_hook_with_one_pending_stage_then_singular_nag_in_additionalContext', async () => {
    const projectDir = await makeProject();
    await seedStage(projectDir, '2026-05-22T10-00-00-000Z', [
      { rel: 'docs/init/seed.md', base_sha256: null },
    ]);

    const result = invokeHook(projectDir);

    const ctx = additionalContextOf(result);
    assert.match(
      ctx,
      /^\*\*1 file staged for \/upgrade-project to reconcile\*\* — run `\/upgrade-project` when ready\.$/m,
      `additionalContext must include the singular upgrade-stage nag; got:\n${ctx}`,
    );
  });

  it('test_when_session_start_hook_with_two_pending_stages_aggregate_three_files_then_plural_nag', async () => {
    const projectDir = await makeProject();
    await seedStage(projectDir, '2026-05-22T11-00-00-000Z', [
      { rel: 'docs/init/seed.md', base_sha256: null },
    ]);
    await seedStage(projectDir, '2026-05-22T12-00-00-000Z', [
      { rel: 'CLAUDE.md', base_sha256: null },
      { rel: 'README.md', base_sha256: null },
    ]);

    const result = invokeHook(projectDir);

    const ctx = additionalContextOf(result);
    assert.match(
      ctx,
      /^\*\*3 files staged for \/upgrade-project to reconcile\*\* — run `\/upgrade-project` when ready\.$/m,
      `additionalContext must use plural "files" with aggregate count 3; got:\n${ctx}`,
    );
  });

  it('test_when_session_start_hook_with_zero_pending_stages_then_no_upgrade_stage_nag_emitted', async () => {
    const projectDir = await makeProject();
    // No stage dir seeded.

    const result = invokeHook(projectDir);

    const ctx = additionalContextOf(result);
    assert.doesNotMatch(
      ctx,
      /staged for \/upgrade-project/,
      `additionalContext must NOT contain any upgrade-stage nag when no stages exist; got:\n${ctx}`,
    );
  });

  it('test_when_session_start_hook_during_active_workflow_with_pending_stage_then_nag_still_fires', async () => {
    const projectDir = await makeProject();
    await seedStage(projectDir, '2026-05-22T13-00-00-000Z', [
      { rel: 'docs/init/seed.md', base_sha256: null },
    ]);
    await seedWorkflowJson(projectDir);

    const result = invokeHook(projectDir);

    const ctx = additionalContextOf(result);
    assert.match(
      ctx,
      /^\*\*1 file staged for \/upgrade-project to reconcile\*\* — run `\/upgrade-project` when ready\.$/m,
      `upgrade-stage nag must fire regardless of workflow.json presence (design pick 2C); got:\n${ctx}`,
    );
  });

  it('test_when_session_start_hook_with_all_RECONCILED_entries_then_no_nag_fires', async () => {
    const projectDir = await makeProject();
    await seedStage(projectDir, '2026-05-22T14-00-00-000Z', [
      { rel: 'docs/init/seed.md', base_sha256: null, status: 'RECONCILED' },
    ]);

    const result = invokeHook(projectDir);

    const ctx = additionalContextOf(result);
    assert.doesNotMatch(
      ctx,
      /staged for \/upgrade-project/,
      `additionalContext must NOT nag when every stage entry is RECONCILED (only PENDING counts); got:\n${ctx}`,
    );
  });
});
