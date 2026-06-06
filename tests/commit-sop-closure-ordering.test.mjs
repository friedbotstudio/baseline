// Phase 6 (commit-closure-stamp-carry) — governance scan of the commit SOP.
// Defends the invariant the original bug violated: the closure stamp is staged
// BEFORE the git commit step, the SHA-bearing note is gone, and a post-commit
// clean-tree report exists. Spec: §Behavior #4/#5, AC-004/005.
// RED until commit/SKILL.md is reordered.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(REPO_ROOT, '.claude/skills/commit/SKILL.md');

describe('commit/SKILL.md closure ordering (AC-004/005)', () => {
  const text = readFileSync(SKILL, 'utf8');

  it('test_when_commit_skill_read_then_stamp_precedes_commit', () => {
    const stampIdx = text.search(/git add[^\n]*backlog\.md/i);
    // Anchor on the backticked command token, not the prose "Git Commit Guard".
    const commitIdx = text.search(/`git commit`/i);
    assert.ok(stampIdx >= 0, 'SOP must stage backlog.md (a `git add ... backlog.md` step)');
    assert.ok(commitIdx >= 0, 'SOP must reference the `git commit` command');
    assert.ok(stampIdx < commitIdx, 'the closure stamp+stage step must precede the git commit step');
  });

  // covers AC-005 — the SHA-bearing note is dropped (atomicity forbids self-reference)
  it('test_when_commit_skill_read_then_no_sha_bearing_note', () => {
    assert.doesNotMatch(text, /SHIPPED \(commit/, 'the SHA-bearing post-commit note must be dropped (atomicity)');
  });

  it('test_when_commit_skill_read_then_post_commit_status_report_present', () => {
    assert.match(text, /git status --porcelain/, 'SOP must report post-commit tree status (AI-03)');
  });
});
