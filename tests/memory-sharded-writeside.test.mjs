// Scenarios for the sharded-aware write-side memory tooling: sweep.mjs modes
// (stamp-closure, auto-close) operate on `backlog/<slug>.md` per-fact files, and
// the closure guard (evaluateClosure) is satisfied by a staged sharded fact file
// whose frontmatter carries the stamp. Covers the activation's write-side gap.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const SWEEP = join(REPO_ROOT, '.claude/skills/memory-sync/sweep.mjs');
const CLOSURE = pathToFileURL(join(REPO_ROOT, '.claude/hooks/lib/closure-check.mjs')).href;

function seedShardedBacklog(root, key, extraFields = '') {
  const dir = join(root, '.claude/memory/backlog');
  mkdirSync(dir, { recursive: true });
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  writeFileSync(join(dir, `${slug}.md`), `---
key: ${key}
category: backlog
source: user-instruction
status: open
raised-on: 2026-07-10
${extraFields}---

- Intent: redesign the memory system.
`);
  return join(dir, `${slug}.md`);
}

describe('sweep stamp-closure — sharded backlog (write-side)', () => {
  it('test_when_stamp_closure_on_sharded_then_fact_file_stamped', () => {
    const root = mkdtempSync(join(tmpdir(), 'sw-stamp-'));
    try {
      const key = 'memory-redesign-followup-ab12';
      const factPath = seedShardedBacklog(root, key);
      const r = spawnSync('node', [SWEEP, '--mode', 'stamp-closure', '--memory-dir', join(root, '.claude/memory'), '--backlog-keys', key], { encoding: 'utf8' });
      assert.match(r.stdout, /"stamped": 1/, `expected 1 stamped: ${r.stdout}${r.stderr}`);
      const text = readFileSync(factPath, 'utf8');
      assert.match(text, /^status: picked-up$/m, 'status flipped to picked-up in frontmatter');
      assert.match(text, /^superseded-at: \d{4}-\d{2}-\d{2}$/m, 'superseded-at stamped in frontmatter');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('sweep auto-close — sharded store (write-side)', () => {
  it('test_when_superseded_fact_then_auto_close_deletes_file', () => {
    const root = mkdtempSync(join(tmpdir(), 'sw-close-'));
    try {
      const dir = join(root, '.claude/memory/decisions');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'open.md'), '---\nkey: open\ncategory: decisions\nverified-at: abc1234\n---\n\nopen decision\n');
      writeFileSync(join(dir, 'closed.md'), '---\nkey: closed\ncategory: decisions\nsuperseded-at: 2026-07-01\n---\n\nclosed decision\n');
      const r = spawnSync('node', [SWEEP, '--mode', 'auto-close', '--memory-dir', join(root, '.claude/memory')], { encoding: 'utf8' });
      assert.match(r.stdout, /"closed": 1/, `expected 1 closed: ${r.stdout}${r.stderr}`);
      assert.ok(existsSync(join(dir, 'open.md')), 'open entry survives');
      assert.ok(!existsSync(join(dir, 'closed.md')), 'superseded entry deleted (auto-closed)');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('closure guard — satisfied by a staged sharded fact file', () => {
  it('test_when_sharded_backlog_stamped_and_staged_then_not_blocked', async () => {
    const { evaluateClosure } = await import(CLOSURE);
    const stagedPaths = ['.claude/state/workflow.json', '.claude/memory/backlog/foo-ab12.md'];
    const readStaged = (p) => {
      if (p.endsWith('workflow.json')) return JSON.stringify({ source_backlog_keys: ['foo-key-ab12'] });
      if (p.endsWith('foo-ab12.md')) return '---\nkey: foo-key-ab12\ncategory: backlog\nstatus: picked-up\nsuperseded-at: 2026-07-17\n---\n\nbody\n';
      return '';
    };
    assert.equal(evaluateClosure({ stagedPaths, readStaged }).block, false, 'stamped + staged sharded fact satisfies the obligation');
  });

  it('test_when_sharded_backlog_staged_but_unstamped_then_blocked', async () => {
    const { evaluateClosure } = await import(CLOSURE);
    const stagedPaths = ['.claude/state/workflow.json', '.claude/memory/backlog/foo-ab12.md'];
    const readStaged = (p) => {
      if (p.endsWith('workflow.json')) return JSON.stringify({ source_backlog_keys: ['foo-key-ab12'] });
      if (p.endsWith('foo-ab12.md')) return '---\nkey: foo-key-ab12\ncategory: backlog\nstatus: open\n---\n\nbody\n';
      return '';
    };
    const r = evaluateClosure({ stagedPaths, readStaged });
    assert.equal(r.block, true, 'staged but unstamped sharded fact still blocks');
    assert.deepEqual(r.unsatisfied, ['foo-key-ab12']);
  });
});
