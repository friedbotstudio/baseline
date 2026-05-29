// Tests for the #13 line-anchored frontmatter strip in both
// memory_session_start (index builder) and sweep.mjs (splitEntries).
// Both used to call indexOf('---', N) which matched any substring; a
// body horizontal rule appearing before the actual frontmatter close
// would silently truncate the parsed body.

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
const SWEEP = join(REPO_ROOT, '.claude/skills/memory-flush/sweep.mjs');

function seedTree() {
  const root = mkdtempSync(join(tmpdir(), 'mem-strip-fm-'));
  mkdirSync(join(root, '.claude/memory'), { recursive: true });
  mkdirSync(join(root, '.claude/state/harness'), { recursive: true });
  return root;
}

// A pending-questions file whose frontmatter body contains the substring
// `---` (mentioned in a `caveat:` line). The naive indexOf-based parser
// would stop at that substring and lose downstream content.
const TRICKY_FRONTMATTER = `---
owners: [test]
caveat: We sometimes use --- in body text as a separator
size-cap: 500
---

## Q-001

- Question: real entry after a tricky frontmatter
- verified-at: HEAD
- last-touched: 2026-05-28
- resolved-at: 2026-05-29
`;

const CANONICAL_NAMES = ['landmarks', 'libraries', 'decisions', 'landmines', 'conventions', 'pending-questions', 'backlog'];

function seedAllFiles(root, body) {
  for (const name of CANONICAL_NAMES) {
    writeFileSync(join(root, '.claude/memory', `${name}.md`), body);
  }
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

describe('#13 — stripFrontmatter handles `---` substring inside frontmatter body', () => {
  it('memory_session_start indexes the entry after a tricky frontmatter', () => {
    const root = seedTree();
    try {
      seedAllFiles(root, TRICKY_FRONTMATTER);
      writeFileSync(join(root, '.claude/memory/_pending.md'),
        '---\nowners: [test]\n---\n\n# Pending\n');
      const out = runHook(root);
      // Each canonical file has one entry (Q-001). The pending-questions
      // row should show 1, not 0 (which the buggy strip would yield).
      assert.match(out, /pending-questions\.md` \| 1 \|/, `expected pending-questions count 1; full output:\n${out}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('sweep.mjs auto-close detects the closure field through a tricky frontmatter', () => {
    const root = seedTree();
    try {
      seedAllFiles(root, TRICKY_FRONTMATTER);
      const memdir = join(root, '.claude/memory');
      const r = spawnSync('node', [SWEEP, '--mode', 'auto-close', '--memory-dir', memdir],
        { encoding: 'utf8' });
      assert.equal(r.status, 0, `sweep exited non-zero: ${r.stderr}`);
      // Q-001 carries resolved-at:; auto-close MUST delete it. With the buggy
      // strip, splitEntries would have parsed an empty body and reported 0
      // closures.
      assert.match(r.stdout, /"closed": 1/, `expected closed:1 in auto-close report; got: ${r.stdout}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not over-trim when frontmatter is clean', () => {
    // Sanity trap: clean frontmatter still strips correctly.
    const root = seedTree();
    const CLEAN = `---
owners: [test]
size-cap: 500
---

## Q-100

- Question: clean
- verified-at: HEAD
- last-touched: 2026-05-28
- resolved-at: 2026-05-29
`;
    try {
      seedAllFiles(root, CLEAN);
      const memdir = join(root, '.claude/memory');
      const r = spawnSync('node', [SWEEP, '--mode', 'auto-close', '--memory-dir', memdir],
        { encoding: 'utf8' });
      assert.equal(r.status, 0);
      assert.match(r.stdout, /"closed": 1/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
