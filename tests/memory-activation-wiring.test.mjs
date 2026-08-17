// Scenarios for the live activation wiring — the session-start sharded dual-read
// and the process_lifecycle_guard Write/Edit surfacing leg (AC-002 activation +
// AC-003 activation). Presence-based: a migrated (category-dir) store drives the
// new paths; a flat-file store keeps the old behavior. Fail RED until wired.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const SESSION_START = join(REPO_ROOT, '.claude/hooks/memory_session_start.mjs');
const LIFECYCLE_GUARD = join(REPO_ROOT, '.claude/hooks/process_lifecycle_guard.mjs');

const VERBATIM = 'an outcome-AC with no diff line wedges drift_check';

// Staleness is >= 30 days from `last-touched`, so a hardcoded date is a time
// bomb: the fixture passes until the wall clock crosses the threshold, then
// fails for a reason that has nothing to do with the code under test. Derive
// the date from today so the entry is always comfortably fresh.
function recentDate() {
  const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function seedMigratedStore(root) {
  const mem = join(root, '.claude/memory');
  for (const c of ['landmarks', 'libraries', 'decisions', 'landmines', 'conventions', 'pending-questions', 'backlog']) {
    mkdirSync(join(mem, c), { recursive: true });
  }
  mkdirSync(join(root, '.claude/state/harness'), { recursive: true });
  writeFileSync(join(mem, 'landmines', 'outcome-ac.md'), `---
key: outcome-ac
category: landmines
scope: [spec]
source: incident
verified-at: abc1234
last-touched: ${recentDate()}
---

> verbatim (incident, 2026-07-10):
> ${VERBATIM}

Classify every AC as behavioural or process/outcome before writing the AC table.
`);
  writeFileSync(join(mem, '_pending.md'), '---\nowners: [test]\n---\n\n# Pending\n');
}

describe('activation — session-start reads the sharded store (AC-002)', () => {
  it('test_when_store_is_sharded_then_index_counts_category_dirs', () => {
    const root = mkdtempSync(join(tmpdir(), 'mem-act-ss-'));
    try {
      seedMigratedStore(root);
      const r = spawnSync('node', [SESSION_START], {
        env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root },
        input: '{}',
        encoding: 'utf8',
      });
      const ctx = r.stdout ? (JSON.parse(r.stdout)?.hookSpecificOutput?.additionalContext || '') : '';
      assert.match(ctx, /`landmines\.md` \| 1 \| 0 \| sharded/, 'the sharded landmines dir is counted as 1 entry with sharded status');
      assert.match(ctx, /total entries: 1\b/, 'total counts the per-fact file, not a flat file');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('activation — guard surfaces scoped memory on a spec write (AC-003)', () => {
  function runGuard(root, filePath) {
    return spawnSync('node', [LIFECYCLE_GUARD], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root },
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } }),
      encoding: 'utf8',
    });
  }

  it('test_when_write_to_spec_then_guard_surfaces_verbatim', () => {
    const root = mkdtempSync(join(tmpdir(), 'mem-act-g1-'));
    try {
      seedMigratedStore(root);
      const r = runGuard(root, 'docs/specs/some-feature.md');
      assert.match(r.stderr || '', new RegExp(VERBATIM), 'a Write to docs/specs surfaces the scope:[spec] landmine verbatim');
      assert.match(r.stderr || '', /Article IX clause 7/, 'cites the binding-verbatim clause');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_write_to_unscoped_path_then_guard_silent', () => {
    const root = mkdtempSync(join(tmpdir(), 'mem-act-g2-'));
    try {
      seedMigratedStore(root);
      const r = runGuard(root, 'README.md');
      assert.doesNotMatch(r.stderr || '', new RegExp(VERBATIM), 'a Write to a non-phase path surfaces nothing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
