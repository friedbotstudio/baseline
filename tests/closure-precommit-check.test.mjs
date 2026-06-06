// Phase 6 (commit-closure-stamp-carry) — /commit preflight helper.
// Friendly pre-guard error + the message-dependent `Closes <key>` reconciliation
// (AI-04) that is deliberately kept OUT of the hard-block guard (spec D2).
// Spec: §Behavior #4, AC-004. RED until closure-precommit-check.mjs exists.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(REPO_ROOT, '.claude/skills/commit/closure-precommit-check.mjs');

function entry(key, stamped) {
  return [`## ${key}`, '', `- status: ${stamped ? 'picked-up' : 'open'}`]
    .concat(stamped ? [`- superseded-at: 2026-06-06`] : []).concat(['', '---', '']).join('\n');
}

// Build a tmp memory-dir + staged-file list + optional message-file, run the CLI.
function run({ backlog, keys, staged, message }) {
  const dir = mkdtempSync(join(tmpdir(), 'pre-'));
  writeFileSync(join(dir, 'backlog.md'), '# Backlog\n\n' + backlog);
  const stagedFile = join(dir, 'staged.txt');
  writeFileSync(stagedFile, (staged || []).join('\n'));
  const args = [CHECK, '--memory-dir', dir, '--backlog-keys', keys.join(','), '--staged-file', stagedFile];
  if (message !== undefined) {
    const mf = join(dir, 'msg.txt');
    writeFileSync(mf, message);
    args.push('--message-file', mf);
  }
  const r = spawnSync('node', args, { encoding: 'utf8' });
  let report = {};
  try { report = JSON.parse(r.stdout); } catch { /* non-JSON on usage errors */ }
  return { ...r, report, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('closure-precommit-check.mjs (AC-004)', () => {
  it('test_when_unreconciled_closes_then_exit_1', () => {
    const r = run({
      backlog: entry('k1-aaaa', true),
      keys: ['k1-aaaa'],
      staged: ['.claude/memory/backlog.md'],
      message: 'fix: x\n\nCloses other-key-bbbb',
    });
    try {
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.ok((r.report.unreconciledCloses || []).includes('other-key-bbbb'));
    } finally { r.cleanup(); }
  });

  it('test_when_closes_variants_then_parsed', () => {
    for (const message of ['done\n\nCloses k1-aaaa', 'done\n\nCloses backlog k1-aaaa', 'done\n\nCLOSES k1-aaaa.', 'closes the gap; Closes k1-aaaa']) {
      const r = run({ backlog: entry('k1-aaaa', true), keys: ['k1-aaaa'], staged: ['.claude/memory/backlog.md'], message });
      try {
        assert.equal(r.status, 0, `"${message}" should reconcile to exit 0.\n${r.stdout}${r.stderr}`);
      } finally { r.cleanup(); }
    }
  });

  it('test_when_preflight_unstamped_or_unstaged_then_exit_1', () => {
    const unstamped = run({ backlog: entry('k1-aaaa', false), keys: ['k1-aaaa'], staged: ['.claude/memory/backlog.md'] });
    try { assert.equal(unstamped.status, 1, 'unstamped key must fail'); } finally { unstamped.cleanup(); }
    const unstaged = run({ backlog: entry('k1-aaaa', true), keys: ['k1-aaaa'], staged: ['src/x.mjs'] });
    try { assert.equal(unstaged.status, 1, 'backlog.md not staged must fail'); } finally { unstaged.cleanup(); }
  });

  it('test_when_preflight_all_good_then_exit_0', () => {
    const r = run({ backlog: entry('k1-aaaa', true), keys: ['k1-aaaa'], staged: ['.claude/memory/backlog.md'], message: 'fix: x\n\nCloses k1-aaaa' });
    try {
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.equal(r.report.ok, true);
    } finally { r.cleanup(); }
  });
});
