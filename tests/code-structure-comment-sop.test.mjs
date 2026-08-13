// The SOP's comment SEQUENCING, as distinct from the comment policy.
//
// tests/code-structure-comment-policy.test.mjs already pins the policy text and is
// byte-frozen by AC-020. This file pins the ordering rule added on top of it: the
// first draft carries no body comment, and a comment enters on a reviewer's request.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { REPO_ROOT, readFileSync } from './helpers/memory-fixtures.mjs';

const SKILL = '.claude/skills/code-structure/SKILL.md';
const FROZEN = 'tests/code-structure-comment-policy.test.mjs';

const CARVE_OUTS = [
  { label: 'why-comment', pattern: /\bwhy[- ]comment\b/i },
  { label: 'lazy: marker', pattern: /`?lazy:`?/ },
  { label: 'module header', pattern: /module header/i },
];

function readSkill() {
  return readFileSync(join(REPO_ROOT, SKILL), 'utf8');
}

function carries(text, pattern, message) {
  assert.ok(pattern.test(text), message);
}

describe('code-structure comment sequencing', () => {
  it('test_when_sop_read_then_it_directs_a_comment_free_first_draft', () => {
    // Covers AC-018.
    carries(
      readSkill(),
      /first draft[^.\n]{0,60}no (body )?comment|no (body )?comment[^.\n]{0,60}first draft|write the code first[^.\n]{0,60}comment/i,
      'the SOP must direct a first draft that carries no body comment — a default stated without an ordering loses to the habit of commenting at write time',
    );
  });

  it('test_when_sop_read_then_it_names_a_review_request_as_the_trigger', () => {
    // Covers AC-019.
    carries(
      readSkill(),
      /review[^.\n]{0,40}(request|asks|ask for)|(request|asks|ask for)[^.\n]{0,40}review/i,
      'the SOP must name a review-phase request as the sanctioned trigger for adding a comment',
    );
  });

  it('test_when_sop_read_then_carve_outs_are_preserved', () => {
    // Covers AC-019.
    const skill = readSkill();
    for (const { label, pattern } of CARVE_OUTS) {
      carries(skill, pattern, `the "${label}" carve-out must survive the sequencing change — AC-019 keeps all three`);
    }
  });

  it('test_when_comment_policy_suite_runs_then_it_passes_unmodified', () => {
    // Covers AC-020.
    const committed = execFileSync('git', ['show', `HEAD:${FROZEN}`], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(
      readFileSync(join(REPO_ROOT, FROZEN), 'utf8'), committed,
      `AC-020 freezes ${FROZEN} — a change here would let the new sequencing rule be "proved" by editing its own oracle`,
    );
    execFileSync('node', ['--test', FROZEN], { cwd: REPO_ROOT, encoding: 'utf8' });
  });
});
