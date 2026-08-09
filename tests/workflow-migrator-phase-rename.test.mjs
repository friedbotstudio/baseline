// T4 — an in-flight workflow survives the rename (AC-011, AC-012).
//
// D-3 (spec): the migrator already remaps completed[] phase names for the
// pre-§18 shape and is idempotent, so the rename reuses it for one map entry
// rather than shipping a transitional alias skill. AC-011 is a `preflight`-kind
// AC because Rollout prerequisite 3 binds to it: an in-flight workflow.json must
// migrate BEFORE Phase 10.7 runs, or the workflow cannot finish its own landing.
//
// The needle is assembled, not spelled out — see memory-sync-rename.test.mjs for
// why a rename suite must not contain the string it forbids.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport, readFileSync } from './helpers/memory-fixtures.mjs';

const MIGRATOR = 'src/cli/workflow-migrator.js';
const MIRRORS = [
  { mirror: '.claude/skills/harness/workflow-migrator.js', source: 'src/cli/workflow-migrator.js' },
  { mirror: '.claude/skills/triage/track-tasklist-materializer.js', source: 'src/cli/track-tasklist-materializer.js' },
];

const OLD = ['memory', 'flush'].join('-');
const NEW = ['memory', 'sync'].join('-');

function workflowFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'migrator-'));
  const path = join(dir, 'workflow.json');
  writeFileSync(path, JSON.stringify({
    request: 'x',
    slug: 'in-flight',
    track_id: 'power',
    completed: ['spec', OLD],
    exceptions: ['intake', OLD],
    skipped_alternates: [],
    created_at: 1,
    updated_at: 1,
  }, null, 2));
  return { dir, path };
}

async function migrate(path) {
  const mod = await tryImport(MIGRATOR);
  assert.ok(mod, `${MIGRATOR} must be importable`);
  assert.equal(typeof mod.migrateWorkflowJsonInPlace, 'function', 'expected named export `migrateWorkflowJsonInPlace`');
  return mod.migrateWorkflowJsonInPlace(path);
}

describe('workflow migrator phase rename', () => {
  // AC-011
  it('test_when_workflow_json_carries_memory_flush_then_migrator_maps_it_to_memory_sync', async () => {
    const { dir, path } = workflowFixture();
    try {
      await migrate(path);
      const after = JSON.parse(readFileSync(path, 'utf8'));

      assert.ok(after.completed.includes(NEW), `completed[] must carry the new phase name; got ${JSON.stringify(after.completed)}`);
      assert.ok(!after.completed.includes(OLD), 'completed[] must no longer carry the old name');
      assert.ok(after.exceptions.includes(NEW), `exceptions[] must be remapped too; got ${JSON.stringify(after.exceptions)}`);
      assert.ok(!after.exceptions.includes(OLD), 'exceptions[] must no longer carry the old name');
      assert.ok(after.completed.includes('spec'), 'an unrelated phase must pass through untouched');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-011 — idempotence boundary.
  it('test_when_migrator_runs_twice_then_the_second_run_is_a_noop', async () => {
    const { dir, path } = workflowFixture();
    try {
      await migrate(path);
      const first = readFileSync(path, 'utf8');
      await migrate(path);
      const second = readFileSync(path, 'utf8');

      assert.equal(second, first, 'a second migration must change no bytes — the harness runs it on every resume');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-012 — the drift gate over the whole rename.
  it('test_when_audit_baseline_runs_after_rename_then_exit_is_zero', () => {
    const res = execFileSync('node', ['.claude/skills/audit-baseline/audit.mjs'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    assert.match(res, /PASS/, 'audit-baseline must report PASS after the rename; a hash or count drift here means the manifest was not refreshed');
  });

  // AC-012 — the build mirrors are guarded; the rename must go through src/.
  it('test_when_mirrors_compared_after_t4_and_t6_then_bytes_equal_src_cli_sources', () => {
    for (const { mirror, source } of MIRRORS) {
      const mirrorBytes = readFileSync(join(REPO_ROOT, mirror), 'utf8');
      const sourceBytes = readFileSync(join(REPO_ROOT, source), 'utf8');
      assert.equal(
        mirrorBytes,
        sourceBytes,
        `${mirror} must stay byte-equal to ${source} — editing the mirror is reverted by the next build, so the rename has to land in src/ and be rebuilt`,
      );
    }
  });
});
