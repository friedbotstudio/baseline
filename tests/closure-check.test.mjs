// Phase 6 (commit-closure-stamp-carry) — Foundation lib `closure-check.mjs`.
// Pure stamp-reader + closure evaluator shared by git_commit_guard (enforcement)
// and closure-precommit-check.mjs (preflight). RED until the lib exists.
// Spec: docs/specs/commit-closure-stamp-carry.md §Behavior #1/#2/#3, AC-001/002/003.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(REPO_ROOT, '.claude/hooks/lib/closure-check.mjs');
const SWEEP = join(REPO_ROOT, '.claude/skills/memory-flush/sweep.mjs');
const imp = () => import(LIB);

// A backlog entry as it appears in .claude/memory/backlog.md.
function entry(key, { status = 'open', superseded = null } = {}) {
  const lines = [`## ${key}`, '', `> verbatim (assistant, 2026-06-06):`, `> "x"`, '', `- source: assistant-deferral`, `- status: ${status}`, `- raised-on: 2026-06-06`];
  if (superseded) lines.push(`- superseded-at: ${superseded}`);
  lines.push('', '---', '');
  return lines.join('\n');
}
const STAMPED = { status: 'picked-up', superseded: '2026-06-06' };

describe('closure-check.unsatisfiedKeys — stamp reader (AC-001/002)', () => {
  it('test_when_all_keys_stamped_then_no_unsatisfied', async () => {
    const { unsatisfiedKeys } = await imp();
    const text = entry('mutation-oracle-tdd-checker-f029', STAMPED);
    assert.deepEqual(unsatisfiedKeys(text, ['mutation-oracle-tdd-checker-f029']), []);
  });

  it('test_when_key_status_open_then_unsatisfied', async () => {
    const { unsatisfiedKeys } = await imp();
    const text = entry('some-key-aaaa', { status: 'open' });
    assert.deepEqual(unsatisfiedKeys(text, ['some-key-aaaa']), ['some-key-aaaa']);
  });

  it('test_when_key_absent_then_unsatisfied', async () => {
    const { unsatisfiedKeys } = await imp();
    const text = entry('other-key-bbbb', STAMPED);
    assert.deepEqual(unsatisfiedKeys(text, ['missing-key-cccc']), ['missing-key-cccc']);
  });

  it('test_when_some_keys_stamped_then_only_unstamped_returned', async () => {
    const { unsatisfiedKeys } = await imp();
    const text = entry('k1-aaaa', STAMPED) + entry('k2-bbbb', { status: 'open' });
    assert.deepEqual(unsatisfiedKeys(text, ['k1-aaaa', 'k2-bbbb']), ['k2-bbbb']);
  });
});

describe('closure-check.evaluateClosure — obligation from staged tree (AC-002/003)', () => {
  const backlogPath = '.claude/memory/backlog.md';
  // readStaged simulates `git show :<path>` — returns staged content or null.
  const makeReader = (map) => (p) => (p in map ? map[p] : null);

  // covers AC-003 — a commit staging no closing workflow.json is a clean no-op
  it('test_when_evaluate_closure_no_workflow_json_then_no_block', async () => {
    const { evaluateClosure } = await imp();
    const r = evaluateClosure({ stagedPaths: ['src/x.mjs', 'README.md'], readStaged: makeReader({}) });
    assert.equal(r.block, false);
  });

  it('test_when_evaluate_closure_empty_keys_then_no_block', async () => {
    const { evaluateClosure } = await imp();
    const wf = 'docs/archive/2026-06-06/s/workflow.json';
    const r = evaluateClosure({
      stagedPaths: [wf],
      readStaged: makeReader({ [wf]: JSON.stringify({ source_backlog_keys: [] }) }),
    });
    assert.equal(r.block, false);
  });

  it('test_when_evaluate_closure_unsatisfied_then_block_with_reason', async () => {
    const { evaluateClosure } = await imp();
    const wf = 'docs/archive/2026-06-06/s/workflow.json';
    const r = evaluateClosure({
      stagedPaths: [wf, backlogPath],
      readStaged: makeReader({
        [wf]: JSON.stringify({ source_backlog_keys: ['k1-aaaa'] }),
        [backlogPath]: entry('k1-aaaa', { status: 'open' }),
      }),
    });
    assert.equal(r.block, true);
    assert.match(r.reason, /k1-aaaa/);
  });

  it('test_when_evaluate_closure_backlog_not_staged_then_block', async () => {
    const { evaluateClosure } = await imp();
    const wf = 'docs/archive/2026-06-06/s/workflow.json';
    // workflow.json staged with a key, but backlog.md NOT in stagedPaths (split attack).
    const r = evaluateClosure({
      stagedPaths: [wf],
      readStaged: makeReader({ [wf]: JSON.stringify({ source_backlog_keys: ['k1-aaaa'] }) }),
    });
    assert.equal(r.block, true);
  });
});

describe('sweep.mjs stamp-closure regression (AC-004)', () => {
  it('test_when_sweep_stamp_closure_then_only_status_and_superseded', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sweep-'));
    try {
      writeFileSync(join(dir, 'backlog.md'), '# Backlog\n\n' + entry('k1-aaaa', { status: 'open' }));
      const r = spawnSync('node', [SWEEP, '--mode', 'stamp-closure', '--memory-dir', dir, '--backlog-keys', 'k1-aaaa'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const out = readFileSync(join(dir, 'backlog.md'), 'utf8');
      assert.match(out, /status: picked-up/);
      assert.match(out, /superseded-at:/);
      assert.doesNotMatch(out, /SHIPPED \(commit/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
