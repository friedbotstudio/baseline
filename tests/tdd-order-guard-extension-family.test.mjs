// tdd_order_guard — the extension-family bridge for non-JS/TS sources.
//
// The guard derives candidate test paths from the source's extension. For
// .js/.mjs/.cjs it accepts any JS-family test and for .ts/.tsx any TS-family
// one, but every other extension falls back to itself — so a new `.sh` script
// can only be satisfied by a `.sh` test.
//
// That contradicts how this repo already tests shell scripts:
// scripts/publish-check.sh is covered by tests/publish-check.test.mjs, and
// scripts/build-template.sh the same way. Those pass only because the guard
// fires on file CREATION, so the mismatch was never exposed until a new shell
// script needed one.
//
// seed.md §4.1 records the defect and prescribes the repair: "The same
// `.sh`-source blind spot remains (T-009 worked around it via Bash heredoc);
// extend the family bridge to shell variants in this follow-up."
//
// The widening must be STRICTLY ADDITIVE. This hook ships to consumer installs,
// so a change that removes a candidate would start blocking writes those
// projects make today. Every candidate the guard accepts now must still be
// accepted; the bridge may only add.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = path.join(REPO_ROOT, '.claude/hooks/tdd_order_guard.mjs');

function project({ testFiles = [] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tdd-family-'));
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  writeFileSync(
    path.join(dir, '.claude/project.json'),
    JSON.stringify({
      configured: true,
      tdd: {
        enabled: true,
        source_globs: ['scripts/**', 'src/**', 'lib/**'],
        test_globs: ['tests/**', '**/*.test.*', '**/*_test.*'],
        exempt_globs: [],
      },
    }, null, 2),
  );
  for (const rel of testFiles) {
    mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), '// fixture test\n');
  }
  return dir;
}

// Exit 0 with no block payload is an allow; the guard emits a block as JSON on
// stdout, so the decision is read from the payload rather than the status.
function guardDecision(projectDir, relPath) {
  const result = spawnSync('node', [GUARD], {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    input: JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: path.join(projectDir, relPath) },
    }),
  });
  const out = `${result.stdout || ''}`;
  return /deny|"decision"\s*:\s*"block"|TDD Order Guard/i.test(out) ? 'block' : 'allow';
}

describe('tdd_order_guard — extension-family bridge', () => {
  it('test_when_a_new_shell_script_has_a_js_test_then_the_guard_allows_it', () => {
    const dir = project({ testFiles: ['tests/deploy.test.mjs'] });
    try {
      assert.equal(
        guardDecision(dir, 'scripts/deploy.sh'), 'allow',
        'a .sh source covered by tests/<name>.test.mjs must pass. That pairing is this repo\'s '
        + 'own convention (scripts/publish-check.sh -> tests/publish-check.test.mjs), and today '
        + 'the guard cannot see it because a .sh source only ever looks for .sh tests.',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('test_when_a_new_shell_script_has_a_sibling_shell_test_then_the_guard_allows_it', () => {
    const dir = project({ testFiles: ['tests/deploy_test.bash'] });
    try {
      assert.equal(
        guardDecision(dir, 'scripts/deploy.sh'), 'allow',
        'seed.md §4.1 asks for shell variants to bridge to each other: a .bash test must satisfy '
        + 'a .sh source',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('test_when_a_new_shell_script_has_no_test_at_all_then_the_guard_still_blocks', () => {
    const dir = project({ testFiles: [] });
    try {
      assert.equal(
        guardDecision(dir, 'scripts/deploy.sh'), 'block',
        'widening the family must not turn the guard off — an untested new source still blocks',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('test_when_a_js_source_has_a_js_test_then_the_guard_still_allows_it', () => {
    const dir = project({ testFiles: ['tests/thing.test.mjs'] });
    try {
      assert.equal(
        guardDecision(dir, 'src/thing.js'), 'allow',
        'the JS family bridge is the behaviour consumer installs already depend on; the widening '
        + 'is additive and must not disturb it',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('test_when_a_python_source_has_a_python_test_then_the_guard_still_allows_it', () => {
    const dir = project({ testFiles: ['tests/thing_test.py'] });
    try {
      assert.equal(
        guardDecision(dir, 'src/thing.py'), 'allow',
        'a consumer project on another stack must keep matching its own convention — this is the '
        + 'regression the additive-only rule exists to prevent',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
