// AC-004 / AC-005 — the gitignore_leak_guard PreToolUse hook.
//
// RED until .claude/hooks/gitignore_leak_guard.mjs + the baseline data file exist.
// The hook reads <CLAUDE_PROJECT_DIR>/.claude/skills/gitignore/baseline-ignores.json
// (∪ project.json extras), inspects staged paths via git, and emits a PreToolUse
// decision. Tests run fully offline against real tmp git repos.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = join(REPO_ROOT, '.claude/hooks/gitignore_leak_guard.mjs');
const BASELINE_DATA = join(REPO_ROOT, '.claude/skills/gitignore/baseline-ignores.json');

async function tmpGitRepo({ git = true, seedData = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'gi-guard-'));
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  }
  if (seedData) {
    const dest = join(dir, '.claude/skills/gitignore/baseline-ignores.json');
    await mkdir(dirname(dest), { recursive: true });
    // Copies the real baseline set so the hook exercises production data.
    // Absent until the feature is built -> the leak/clean assertions go RED.
    try { await cp(BASELINE_DATA, dest); } catch { /* not built yet */ }
  }
  return dir;
}

function runHook(cwd, command) {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  return spawnSync('node', [HOOK], {
    cwd,
    input: payload,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
  });
}

const isDeny = (r) => /"permissiondecision"\s*:\s*"deny"|"decision"\s*:\s*"block"/i.test(r.stdout || '');

describe('AC-004 — gitignore_leak_guard blocks a staged must-ignore leak', () => {
  it('test_when_staged_must_ignore_path_then_hook_blocks_offline', async () => {
    const dir = await tmpGitRepo();
    await writeFile(join(dir, '.env'), 'SECRET=x\n');
    execFileSync('git', ['add', '.env'], { cwd: dir });
    const r = runHook(dir, 'git commit -m "oops"');
    assert.notEqual(r.status, null, 'hook must not time out (no network)');
    assert.ok(isDeny(r), 'a staged .env must be denied');
    assert.match(r.stdout || '', /\.env/, 'the deny reason must name the offending path');
  });

  it('test_when_latent_gap_then_hook_allows_with_advisory', async () => {
    const dir = await tmpGitRepo();
    await mkdir(join(dir, '.claude/state'), { recursive: true });
    await writeFile(join(dir, '.claude/state/probe'), 'x\n'); // exists, not ignored, not staged
    await writeFile(join(dir, 'README.md'), '# ok\n');
    execFileSync('git', ['add', 'README.md'], { cwd: dir });
    const r = runHook(dir, 'git commit -m "feature"');
    assert.ok(!isDeny(r), 'a latent gap must NOT block the commit');
    assert.match(r.stdout || r.stderr || '', /advisor|latent|not ignored/i, 'a latent gap must surface a non-blocking advisory');
  });

  it('test_when_inspection_errors_on_clear_commit_then_fail_closed', async () => {
    const dir = await tmpGitRepo({ git: false }); // no git repo -> staged inspection errors
    const r = runHook(dir, 'git commit -m "x"');
    assert.ok(isDeny(r), 'on a clear git commit the guard fails CLOSED when it cannot inspect');
  });
});

describe('AC-005 — clean stage is allowed', () => {
  it('test_when_clean_stage_then_hook_allows', async () => {
    const dir = await tmpGitRepo();
    await writeFile(join(dir, 'src.txt'), 'code\n');
    execFileSync('git', ['add', 'src.txt'], { cwd: dir });
    const r = runHook(dir, 'git commit -m "clean"');
    assert.equal(r.status, 0, 'the hook must run and exit 0');
    assert.ok(!isDeny(r), 'a commit with no must-ignore path staged must be allowed');
  });

  it('test_when_non_commit_bash_then_hook_allows', async () => {
    const dir = await tmpGitRepo();
    const r = runHook(dir, 'ls -la');
    assert.equal(r.status, 0, 'the hook must run and exit 0');
    assert.ok(!isDeny(r), 'a non-commit Bash command must pass through');
  });
});
