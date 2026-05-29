// Regression test for the `verified-at: HEAD` decay-evasion hatch in
// .claude/hooks/lib/memory_session_start.mjs. Pre-fix: on a git repo,
// `stamp === 'HEAD'` short-circuited to `return false` (always fresh).
// Post-fix: HEAD falls through to the date-based check on last-touched.
//
// Non-git fixtures already exercise the date-fallback path correctly in
// .claude/hooks/tests/memory_session_start_test.sh — this file covers the
// missing git-repo case.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const HOOK_PATH = join(REPO_ROOT, '.claude/hooks/memory_session_start.mjs');

const FRONTMATTER = `---
owners: [test]
size-cap: 500
key: test
---

# Test fixture
`;

function seedGitProject() {
  const root = mkdtempSync(join(tmpdir(), 'mem-head-decay-'));
  mkdirSync(join(root, '.claude/memory'), { recursive: true });
  mkdirSync(join(root, '.claude/state/harness'), { recursive: true });
  spawnSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
  spawnSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t',
    'commit', '--allow-empty', '-q', '-m', 'seed']);
  for (const name of ['landmarks', 'libraries', 'decisions', 'landmines',
    'conventions', 'pending-questions']) {
    writeFileSync(join(root, '.claude/memory', `${name}.md`), FRONTMATTER);
  }
  writeFileSync(join(root, '.claude/memory/_pending.md'),
    '---\nowners: [test]\n---\n\n# Pending\n');
  return root;
}

function daysAgoIso(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addEntry(root, name, key, lastTouched, verifiedAt = 'HEAD') {
  const path = join(root, '.claude/memory', `${name}.md`);
  const block = `\n## ${key}\n\n- role: test\n- verified-at: ${verifiedAt}\n- last-touched: ${lastTouched}\n`;
  spawnSync('sh', ['-c', `cat >> ${JSON.stringify(path)}`], { input: block });
}

function runHook(root) {
  const r = spawnSync('node', [HOOK_PATH], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root },
    input: '{}',
    encoding: 'utf8',
  });
  if (!r.stdout || !r.stdout.trim()) return '';
  return JSON.parse(r.stdout)?.hookSpecificOutput?.additionalContext || '';
}

describe('memory_session_start — HEAD escape hatch closed on git repos', () => {
  it('flags `verified-at: HEAD` + old `last-touched` as stale on a git repo', () => {
    const root = seedGitProject();
    try {
      addEntry(root, 'conventions', 'old-head-stamp', daysAgoIso(120));
      const out = runHook(root);
      assert.match(out, /Stale entries/, 'expected stale block when HEAD-stamped entry is 120 days old');
      assert.match(out, /old-head-stamp/, 'expected the stale entry name in the index');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps `verified-at: HEAD` + fresh `last-touched` non-stale on a git repo', () => {
    const root = seedGitProject();
    try {
      addEntry(root, 'conventions', 'fresh-head-stamp', todayIso());
      const out = runHook(root);
      // The index always renders a row per file; "Stale entries" block only
      // appears when at least one entry is stale. Today-touched entry must
      // not produce a stale block.
      assert.doesNotMatch(out, /## Stale entries/, 'fresh entry must not produce stale block');
      assert.doesNotMatch(out, /fresh-head-stamp/, 'fresh entry must not appear as stale');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('honors real-SHA `verified-at:` against commit distance on git repos', () => {
    const root = seedGitProject();
    try {
      const sha = spawnSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'],
        { encoding: 'utf8' }).stdout.trim();
      addEntry(root, 'conventions', 'fresh-sha-stamp', todayIso(), sha);
      const out = runHook(root);
      assert.doesNotMatch(out, /## Stale entries/, 'current-SHA stamp must not appear stale');
      assert.doesNotMatch(out, /fresh-sha-stamp/, 'current-SHA stamp must not appear in stale block');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
