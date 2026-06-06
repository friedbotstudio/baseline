// Phase 6 (commit-closure-stamp-carry) — git_commit_guard closure leg.
// The guard reads source_backlog_keys from the STAGED archived workflow.json
// and requires the staged backlog.md to carry the stamps; the split attack
// (workflow.json without backlog.md) is blocked. The closure block message
// contains "closure" so the assertion is robust against the consent denial
// that also fires on the temp repo's (default-protected) branch.
// Spec: §Behavior #1/#2/#3, AC-001/002/003. RED until the guard gains the leg.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(REPO_ROOT, '.claude/hooks/git_commit_guard.mjs');
const WF = 'docs/archive/2026-06-06/s/workflow.json';
const BACKLOG = '.claude/memory/backlog.md';

function backlogEntry(key, stamped) {
  return [`## ${key}`, '', `- source: assistant-deferral`, `- status: ${stamped ? 'picked-up' : 'open'}`]
    .concat(stamped ? [`- superseded-at: 2026-06-06`] : [])
    .concat(['', '---', '']).join('\n');
}

function tempRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'gcc-'));
  const git = (args) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
  git(['init', '-q']);
  git(['config', 'user.email', 't@t']);
  git(['config', 'user.name', 't']);
  writeFileSync(join(root, 'seed.txt'), 'x');
  git(['add', 'seed.txt']);
  git(['commit', '-q', '-m', 'init']);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    git(['add', rel]);
  }
  return root;
}

function runGuard(root, command) {
  return spawnSync('node', [GUARD], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });
}
const out = (r) => (r.stdout || '') + (r.stderr || '');
const closureBlocked = (r) => /closure/i.test(out(r));

describe('git_commit_guard closure leg (AC-001/002/003)', () => {
  it('test_when_commit_stages_satisfied_closure_then_guard_allows', () => {
    const root = tempRepo({ [WF]: JSON.stringify({ source_backlog_keys: ['k1-aaaa'] }), [BACKLOG]: backlogEntry('k1-aaaa', true) });
    try {
      const r = runGuard(root, 'git commit -m x');
      assert.equal(closureBlocked(r), false, `satisfied closure must NOT be blocked by the closure leg.\n${out(r)}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_commit_stages_unsatisfied_closure_then_guard_blocks', () => {
    const root = tempRepo({ [WF]: JSON.stringify({ source_backlog_keys: ['k1-aaaa'] }), [BACKLOG]: backlogEntry('k1-aaaa', false) });
    try {
      const r = runGuard(root, 'git commit -m x');
      assert.equal(closureBlocked(r), true, `unstamped key must be blocked by the closure leg.\n${out(r)}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_commit_stages_workflow_without_backlog_then_guard_blocks', () => {
    const root = tempRepo({ [WF]: JSON.stringify({ source_backlog_keys: ['k1-aaaa'] }) });
    try {
      const r = runGuard(root, 'git commit -m x');
      assert.equal(closureBlocked(r), true, `split attack (workflow.json without backlog.md) must be blocked.\n${out(r)}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_commit_stages_no_workflow_json_then_guard_no_ops', () => {
    const root = tempRepo({ 'src/x.txt': 'y' });
    try {
      const r = runGuard(root, 'git commit -m x');
      assert.equal(closureBlocked(r), false, `a non-closing commit must not mention closure.\n${out(r)}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_commit_message_via_F_file_then_index_read_not_message', () => {
    const root = tempRepo({ [WF]: JSON.stringify({ source_backlog_keys: ['k1-aaaa'] }), [BACKLOG]: backlogEntry('k1-aaaa', false), 'msg.txt': 'subject\n\nbody' });
    try {
      const r = runGuard(root, 'git commit -F msg.txt');
      assert.equal(closureBlocked(r), true, `verdict must derive from the index, not the message form.\n${out(r)}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
