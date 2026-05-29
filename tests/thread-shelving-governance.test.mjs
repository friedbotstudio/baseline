// conversation-thread-shelving — governance (AC-10, AC-12).
//
// AC-10: adding shelve/resume as Claude-Code-internal lib (Decision D4) must
//        NOT change the audited counts — no new skill/command, detector folds
//        into memory_stop. audit-baseline is the source of truth.
// AC-12: the constitutional amendment (Decision D6) must be present in seed.md
//        + CLAUDE.md Article IX, CLAUDE.md stays <= 40000 chars, and the
//        byte-mirrors stay equal.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

// ---- AC-10: governance counts unchanged -----------------------------------

describe('AC-10 audit-baseline governance counts unchanged', () => {
  it('test_when_audit_baseline_runs_then_counts_unchanged', () => {
    const r = spawnSync('node', [resolve(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs')], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    // audit must still PASS overall (exit 0) — no count drift introduced.
    assert.equal(r.status, 0, `audit-baseline must exit 0 (counts unchanged); output:\n${out}`);
    // and must not report a skill/command/agent/hook count mismatch.
    assert.equal(/count mismatch|expected \d+ (skills|commands|agents|hooks)/i.test(out), false,
      `audit-baseline reported a count mismatch:\n${out}`);
  });
});

// ---- AC-12: constitutional amendment present + mirrors + cap --------------

describe('AC-12 constitutional amendment present, mirrors equal, cap held', () => {
  it('test_when_amendment_then_seed_md_references_thread', () => {
    const seed = read('docs/init/seed.md');
    assert.match(seed, /_thread\.md/, 'seed.md must reference the _thread.md local memory class');
  });

  it('test_when_amendment_then_claude_md_references_thread', () => {
    const claude = read('CLAUDE.md');
    assert.match(claude, /_thread\.md/, 'CLAUDE.md (Article IX) must reference _thread.md');
  });

  it('test_when_amendment_then_claude_md_under_40k', () => {
    const claude = read('CLAUDE.md');
    assert.ok(claude.length <= 40000, `CLAUDE.md must stay <= 40000 chars; got ${claude.length}`);
  });

  it('test_when_amendment_then_claude_template_byte_mirrors_claude_md', () => {
    assert.equal(read('src/CLAUDE.template.md'), read('CLAUDE.md'),
      'src/CLAUDE.template.md must byte-mirror CLAUDE.md');
  });

  it('test_when_amendment_then_seed_template_references_thread', () => {
    const seedTpl = read('src/seed.template.md');
    assert.match(seedTpl, /_thread\.md/, 'src/seed.template.md must mirror the seed.md _thread.md amendment');
  });
});
