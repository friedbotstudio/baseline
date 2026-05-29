// Tests for the size-cap surface added to memory_session_start.
// Verifies that the index reports per-file status as `over-cap` when the
// file exceeds its declared `size-cap:` frontmatter value, lists the
// over-cap files under "## Files over size-cap", and stays silent
// otherwise.

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

const FRONTMATTER = (cap) => `---
owners: [test]
size-cap: ${cap}
key: test
---

# Test fixture
`;

function seedTree(cap = 500) {
  const root = mkdtempSync(join(tmpdir(), 'mem-size-cap-'));
  mkdirSync(join(root, '.claude/memory'), { recursive: true });
  mkdirSync(join(root, '.claude/state/harness'), { recursive: true });
  for (const name of ['landmarks', 'libraries', 'decisions', 'landmines',
    'conventions', 'pending-questions', 'backlog']) {
    writeFileSync(join(root, '.claude/memory', `${name}.md`), FRONTMATTER(cap));
  }
  writeFileSync(join(root, '.claude/memory/_pending.md'),
    '---\nowners: [test]\n---\n\n# Pending\n');
  return root;
}

function inflate(root, name, lines) {
  // Pad the file with junk lines until it crosses the requested line count.
  // Body lines: text only, no entry headings — staleness logic is unaffected.
  const path = join(root, '.claude/memory', `${name}.md`);
  const filler = Array.from({ length: lines }, (_, i) => `padding line ${i}`).join('\n') + '\n';
  spawnSync('sh', ['-c', `cat >> ${JSON.stringify(path)}`], { input: filler });
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

describe('memory_session_start — size-cap surface', () => {
  it('stays silent when every file is within its cap', () => {
    const root = seedTree(500);
    try {
      const out = runHook(root);
      assert.doesNotMatch(out, /over-cap/, 'no over-cap status expected when all files within cap');
      assert.doesNotMatch(out, /## Files over size-cap/, 'no Files-over-cap section expected');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports `over-cap` status and lists the offending file when one is bloated', () => {
    const root = seedTree(50);
    try {
      // Push landmarks past the 50-line cap.
      inflate(root, 'landmarks', 120);
      const out = runHook(root);
      assert.match(out, /## Files over size-cap/, 'expected Files-over-cap section');
      assert.match(out, /landmarks\.md.*over-cap/s, 'landmarks row should carry over-cap status');
      assert.match(out, /landmarks\.md.* lines \(cap 50/s, 'over-cap row should name the line/cap budget');
      assert.match(out, /SHOULD prune oldest unverified entries/, 'guidance line should reference the README');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('orders worst-overage first when multiple files exceed cap', () => {
    const root = seedTree(50);
    try {
      // landmarks: +60 over cap; libraries: +200 over cap.
      inflate(root, 'landmarks', 110);
      inflate(root, 'libraries', 250);
      const out = runHook(root);
      const section = out.split('## Files over size-cap')[1] || '';
      const libIdx = section.indexOf('libraries.md');
      const lmIdx = section.indexOf('landmarks.md');
      assert.ok(libIdx >= 0 && lmIdx >= 0, 'both files should appear in over-cap section');
      assert.ok(libIdx < lmIdx, `libraries.md (+200 over) should sort before landmarks.md (+60 over); got libIdx=${libIdx} lmIdx=${lmIdx}\n${section}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to default cap=500 when frontmatter omits size-cap', () => {
    const root = seedTree(500);
    try {
      // Overwrite landmarks with a no-cap frontmatter, then bloat it past
      // the 500-line default.
      writeFileSync(join(root, '.claude/memory/landmarks.md'),
        '---\nowners: [test]\n---\n\n# fixture\n');
      inflate(root, 'landmarks', 600);
      const out = runHook(root);
      assert.match(out, /landmarks\.md.* lines \(cap 500/s, 'default cap=500 should apply when not declared');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
