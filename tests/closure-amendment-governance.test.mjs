// Phase 6 (commit-closure-stamp-carry) — AC-006: the seed.md §4.1 + CLAUDE.md
// Article VIII amendment for the closure-obligation guard landed, with byte-equal
// src/ mirrors and the lib-helper count bumped 3 -> 4. Defends the amendment so a
// future edit that drops it (or breaks mirror parity) goes red.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CLAUSE = /closing commit whose staged `backlog\.md` lacks the `source_backlog_keys` closure stamp/;

describe('closure-obligation governance amendment (AC-006)', () => {
  it('test_when_seed_read_then_closure_obligation_documented', () => {
    const seed = read('docs/init/seed.md');
    assert.match(seed, /Atomic closure obligation/);
    assert.match(seed, /Four additional \.mjs helpers/);
  });

  it('test_when_claude_md_read_then_guard_row_cites_closure', () => {
    assert.match(read('CLAUDE.md'), CLAUSE);
  });

  it('test_when_mirrors_read_then_amendment_present_in_templates', () => {
    assert.match(read('src/seed.template.md'), /Atomic closure obligation/);
    assert.match(read('src/seed.template.md'), /Four additional \.mjs helpers/);
    assert.match(read('src/CLAUDE.template.md'), CLAUSE);
  });

  it('test_when_annex_read_then_closure_detail_present', () => {
    assert.match(read('.claude/CONSTITUTION.md'), /Atomic closure obligation \(commit-closure-stamp-carry\)/);
  });
});
