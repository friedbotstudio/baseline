// AC-008 (erp-portables slice H) — lint_runner/test_runner honor file_globs.
//
// Both PostToolUse runners gate on `project.json → lint|test.file_globs` before
// spawning the configured command: written path matches → run (today's behavior);
// no match → skip silently. Absent/empty file_globs → run (back-compat, fail-open).
//
// Run: node --test tests/runner-file-globs.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const RUNNERS = [
  { name: 'lint_runner', hook: join(REPO_ROOT, '.claude/hooks/lint_runner.mjs'), key: 'lint' },
  { name: 'test_runner', hook: join(REPO_ROOT, '.claude/hooks/test_runner.mjs'), key: 'test' },
];

const SENTINEL = 'runner-ran.sentinel';

// A temp project whose configured cmd drops a sentinel file — sentinel presence
// IS the "command was spawned" oracle, so no output parsing is needed.
function makeProject({ fileGlobs }) {
  const root = mkdtempSync(join(tmpdir(), 'runner-globs-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  const section = { cmd: `touch ${SENTINEL}`, timeout_seconds: 30 };
  if (fileGlobs !== undefined) section.file_globs = fileGlobs;
  writeFileSync(
    join(root, '.claude', 'project.json'),
    JSON.stringify({ configured: true, lint: { ...section }, test: { ...section } }, null, 2) + '\n',
  );
  return root;
}

function invokeRunner(hook, root, relPath) {
  const payload = { tool_name: 'Write', tool_input: { file_path: join(root, relPath) } };
  return spawnSync('node', [hook], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

for (const { name, hook } of RUNNERS) {
  describe(`${name} — file_globs gate (AC-008)`, () => {
    it(`test_when_written_path_outside_file_globs_then_runner_skips_silently_${name}`, () => {
      const root = makeProject({ fileGlobs: ['src/**'] });
      try {
        const r = invokeRunner(hook, root, 'lib/foo.js');
        assert.equal(r.status, 0, `${name} exits 0 on a skipped path (stderr: ${r.stderr})`);
        assert.equal(existsSync(join(root, SENTINEL)), false,
          `${name} must NOT spawn the configured cmd for a path outside file_globs`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it(`test_when_written_path_matches_file_globs_then_runner_runs_${name}`, () => {
      const root = makeProject({ fileGlobs: ['src/**'] });
      try {
        const r = invokeRunner(hook, root, 'src/foo.js');
        assert.equal(r.status, 0, `${name} exits 0 on a passing cmd (stderr: ${r.stderr})`);
        assert.equal(existsSync(join(root, SENTINEL)), true,
          `${name} must spawn the configured cmd for a matching path (today's behavior)`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it(`test_when_file_globs_absent_or_empty_then_runner_runs_${name}`, () => {
      for (const fileGlobs of [undefined, []]) {
        const root = makeProject({ fileGlobs });
        try {
          const r = invokeRunner(hook, root, 'lib/foo.js');
          assert.equal(r.status, 0, `${name} exits 0 (stderr: ${r.stderr})`);
          assert.equal(existsSync(join(root, SENTINEL)), true,
            `${name} must run the cmd when file_globs is ${fileGlobs === undefined ? 'absent' : 'empty'} — back-compat fail-open`);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }
    });
  });
}
