// Foundation — git-backed and hook-driving fixtures for the living-system-model
// batch (tickets A/B/C/D).
//
// Sibling of memory-fixtures.mjs, not a fork of it: that module builds shard and
// flat corpora on a plain temp dir; this one builds a REAL git repository (so the
// `verified-at` commit-distance decay path is exercised for real rather than
// simulated) and drives PreToolUse hooks over stdin. Article VI.3 — no internal
// module is mocked anywhere in here.

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { REPO_ROOT } from './memory-fixtures.mjs';

const GIT_IDENTITY = ['-c', 'user.email=t@t', '-c', 'user.name=t'];

function git(root, ...args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

// A real repo with a real .claude/memory tree. Returns the root plus the HEAD sha
// at seed time, which callers stamp into `verified-at` to create commit distance.
export function makeGitProject(prefix = 'memgit-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const memDir = join(root, '.claude', 'memory');
  mkdirSync(memDir, { recursive: true });
  mkdirSync(join(root, '.claude', 'state', 'harness'), { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  git(root, ...GIT_IDENTITY, 'commit', '--allow-empty', '-q', '-m', 'seed');
  return { root, memDir, seedSha: headSha(root) };
}

export function headSha(root) {
  return git(root, 'rev-parse', '--short', 'HEAD').stdout.trim();
}

// Create `n` empty commits so an earlier sha sits `n` commits behind HEAD.
export function advanceCommits(root, n) {
  for (let i = 0; i < n; i++) {
    git(root, ...GIT_IDENTITY, 'commit', '--allow-empty', '-q', '-m', `advance ${i + 1}`);
  }
  return headSha(root);
}

// Drive a PreToolUse hook the way Claude Code does: JSON payload on stdin, the
// project root in CLAUDE_PROJECT_DIR. Returns the raw result so a test can assert
// on stdout (the allow/deny envelope) or stderr (the advisory surface).
export function runPreToolUseHook(hookRelPath, payload, root) {
  return spawnSync('node', [join(REPO_ROOT, hookRelPath)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

export function writeEditPayload(filePath, content = 'x') {
  return { tool_name: 'Write', tool_input: { file_path: filePath, content } };
}

// Run one existing test FILE as a subprocess and report pass/fail. This is how the
// two "existing suite still passes unmodified" regression traps assert without
// editing the file they are defending.
export function runTestFile(relPath) {
  const res = spawnSync('node', ['--test', join(REPO_ROOT, relPath)], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  return { ok: res.status === 0, status: res.status, stdout: res.stdout, stderr: res.stderr };
}

export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
  return path;
}

export { REPO_ROOT };
