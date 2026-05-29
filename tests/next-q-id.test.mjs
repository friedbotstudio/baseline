// Tests for the Q-ID allocator at .claude/skills/memory-flush/next-q-id.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const HELPER = join(REPO_ROOT, '.claude/skills/memory-flush/next-q-id.mjs');

function runHelper(memdir) {
  return spawnSync('node', [HELPER, '--memory-dir', memdir], { encoding: 'utf8' });
}

function seedPendingQuestions(content) {
  const root = mkdtempSync(join(tmpdir(), 'next-q-'));
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'pending-questions.md'),
    `---\nowners: [test]\n---\n\n# Pending\n\n${content}`);
  return root;
}

describe('next-q-id allocator', () => {
  it('returns Q-001 when the file is empty', () => {
    const root = seedPendingQuestions('');
    try {
      const r = runHelper(root);
      assert.equal(r.status, 0, `exit: ${r.status} stderr: ${r.stderr}`);
      assert.equal(r.stdout.trim(), 'Q-001');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('returns max + 1 when entries exist', () => {
    const root = seedPendingQuestions(`## Q-002\n- field\n\n## Q-005\n- field\n\n## Q-007\n- field\n`);
    try {
      const r = runHelper(root);
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), 'Q-008');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('counts CLOSED entries against the max', () => {
    const root = seedPendingQuestions(`## Q-003 — CLOSED 2026-05-10\n- Resolution: settled\n\n## Q-009 — CLOSED 2026-05-15\n- Resolution: settled\n`);
    try {
      const r = runHelper(root);
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), 'Q-010');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('returns Q-001 when no pending-questions.md exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'next-q-empty-'));
    try {
      const r = runHelper(root);
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), 'Q-001');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
