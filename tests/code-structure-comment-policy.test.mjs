// T2 — code-structure defaults to no comment (AC-004, AC-005).
//
// The rule already existed as item 6 of a seven-item list, which is where a rule
// goes to be skimmed past. T2 promotes it to a first-class rule. These tests are
// the "cannot silently regress" half: the policy is prose, so the only thing
// keeping it present is an assertion that reads it.
//
// D-6 (spec): no mechanical what-comment detector. No reliable oracle separates
// a what-comment from a why-comment, and a high-false-positive gate on every
// code write is worse than the stated policy. These tests check the POLICY TEXT.
//
// Every assertion goes through `carries` rather than assert.match. The skill is a
// 273-line document; assert.match would dump the whole of it into the failure
// output, and a red test nobody can read is a red test nobody acts on.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { REPO_ROOT, readFileSync, existsSync } from './helpers/memory-fixtures.mjs';

const SKILL = '.claude/skills/code-structure/SKILL.md';

const NAMED_EXCEPTIONS = [
  { label: 'why-comment', pattern: /\bwhy\b/i },
  { label: 'lazy: marker', pattern: /`?lazy:`?/ },
  { label: 'module header', pattern: /module header|file header|header comment/i },
];

function readSkill() {
  const path = join(REPO_ROOT, SKILL);
  assert.ok(existsSync(path), `${SKILL} must exist — without it every assertion below passes vacuously`);
  return readFileSync(path, 'utf8');
}

function carries(text, pattern, message) {
  assert.ok(pattern.test(text), message);
}

function lacks(text, pattern, message) {
  assert.ok(!pattern.test(text), message);
}

describe('code-structure comment policy', () => {
  // AC-004
  it('test_when_code_structure_skill_read_then_no_comment_default_rule_present', () => {
    const skill = readSkill();

    carries(
      skill,
      /^#{2,4}\s+.*\bcomment/im,
      'the comment policy must be a first-class heading, not buried as a numbered list item — being item 6 of 7 is the defect T2 fixes',
    );
    carries(
      skill,
      /default[^.\n]{0,40}\bno comment\b|\bno comment\b[^.\n]{0,40}default/i,
      'the rule must state that the DEFAULT is no comment',
    );
    carries(
      skill,
      /code (must|should) read without|reads without a comment|human[- ]readable without/i,
      'the rule must state that the code itself has to read without a comment',
    );
  });

  // AC-005
  it('test_when_comment_rule_or_any_named_exception_removed_then_policy_test_fails', () => {
    const skill = readSkill();

    for (const { label, pattern } of NAMED_EXCEPTIONS) {
      carries(
        skill,
        pattern,
        `the "${label}" exception must survive the promotion — a policy banning every comment would forbid recording WHY, which is the one comment that earns its place`,
      );
    }

    lacks(
      skill,
      /^\s*(\/\/|#)\s*(TODO|FIXME|HACK|XXX)\b/m,
      'the policy must not itself demonstrate a forbidden marker as if it were acceptable (CLAUDE.md Art. VI.2)',
    );
  });
});
