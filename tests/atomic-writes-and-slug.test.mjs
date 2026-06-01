// WF-3 (atomic-writes-and-slug-hardening).
//   - CWE-362: JSON state writes must be atomic (temp file + rename), so a crash
//     mid-write can't leave a half-written/corrupt file.
//   - CWE-78: the slug passed into the seed-tasklist subprocess must be
//     constrained to a safe charset.
//   - doc drift: /grant-commit states the wrong consent TTL.
//
// RED until: common.mjs gains writeJsonAtomic; thread_store + resume_transform
// route through it; workflow-migrator does temp+rename; seed-tasklist validates
// the slug; grant-commit.md says 900s.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hasTemp = (dir) => readdirSync(dir).some((f) => /\.tmp\./.test(f));

async function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'wf3-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('WF-3 — atomic JSON writes (CWE-362)', () => {
  it('test_when_writeJsonAtomic_then_roundtrips_with_no_temp_left', async () => {
    const { writeJsonAtomic } = await import(join(REPO_ROOT, '.claude/hooks/lib/common.mjs'));
    await withTmp((dir) => {
      const p = join(dir, 'x.json');
      writeJsonAtomic(p, { a: 1, b: [2, 3] });
      assert.deepEqual(JSON.parse(readFileSync(p, 'utf8')), { a: 1, b: [2, 3] });
      writeJsonAtomic(p, { a: 9 });
      assert.deepEqual(JSON.parse(readFileSync(p, 'utf8')), { a: 9 }, 'overwrites the target fully');
      assert.equal(hasTemp(dir), false, 'no *.tmp.* sibling left (temp+rename)');
    });
  });

  it('test_when_thread_store_writeCursor_then_atomic_roundtrip_no_temp', async () => {
    const { writeCursor, readCursor } = await import(join(REPO_ROOT, '.claude/hooks/lib/thread_store.mjs'));
    await withTmp((dir) => {
      const cursor = { transcript_path: 'x', last_event_uuid: 'u', timestamp: 't' };
      writeCursor({ stateDir: dir, cursor });
      assert.deepEqual(readCursor({ stateDir: dir }), cursor);
      assert.equal(hasTemp(dir), false, 'no temp file left in stateDir');
    });
    // The write must route through the shared atomic helper, not a bare writeFileSync.
    const src = readFileSync(join(REPO_ROOT, '.claude/hooks/lib/thread_store.mjs'), 'utf8');
    assert.match(src, /writeJsonAtomic/, 'thread_store must use writeJsonAtomic for state writes');
  });

  it('test_when_workflow_migrator_writes_then_valid_json_no_temp_left', async () => {
    const { migrateWorkflowJsonInPlace } = await import(join(REPO_ROOT, 'src/cli/workflow-migrator.js'));
    await withTmp(async (dir) => {
      const p = join(dir, 'workflow.json');
      writeFileSync(p, JSON.stringify({
        request: 'x', slug: 'demo', entry_phase: 'tdd', completed: [],
        created_at: 1700000000, updated_at: 1700000000,
      }, null, 2) + '\n');
      await migrateWorkflowJsonInPlace(p);
      const out = JSON.parse(readFileSync(p, 'utf8'));
      assert.equal(out.track_id, 'tdd-quickfix');
      assert.equal('entry_phase' in out, false, 'entry_phase removed post-migration');
      assert.equal(hasTemp(dir), false, 'no *.tmp.* left beside workflow.json');
    });
    const src = readFileSync(join(REPO_ROOT, 'src/cli/workflow-migrator.js'), 'utf8');
    assert.match(src, /rename/, 'workflow-migrator must write atomically (temp + rename)');
  });
});

describe('WF-3 — slug hardening (CWE-78)', () => {
  const SEED = join(REPO_ROOT, '.claude/skills/triage/seed-tasklist.mjs');
  const run = (slug) => spawnSync('node', [SEED, 'tdd-quickfix', slug], { encoding: 'utf8' });

  it('test_when_seed_tasklist_given_unsafe_slug_then_rejected', () => {
    for (const bad of ['a;rm', '../x', 'Foo_Bar']) {
      const r = run(bad);
      assert.notEqual(r.status, 0, `unsafe slug must be rejected: ${bad}`);
      assert.match((r.stderr || '') + (r.stdout || ''), /slug/i, `error must name the slug constraint: ${bad}`);
    }
    const ok = run('my-fix-1');
    assert.equal(ok.status, 0, `conformant slug must still materialize.\nstderr:${ok.stderr}`);
  });
});

describe('WF-3 — grant-commit TTL doc drift (8917)', () => {
  it('test_when_grant_commit_command_then_states_900s_ttl', () => {
    const md = readFileSync(join(REPO_ROOT, '.claude/commands/grant-commit.md'), 'utf8');
    assert.match(md, /valid for 900s/, 'grant-commit.md must state the 900s commit window');
    assert.doesNotMatch(md, /valid for 300s/, 'the stale 300s figure must be gone');
  });
});
