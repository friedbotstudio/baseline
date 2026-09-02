// The backlog closure stamp is read from the entry's frontmatter block, not
// from anywhere in the file.
//
// `git_commit_guard` hard-blocks a closing commit whose staged backlog lacks
// the stamp (CLAUDE.md Art. VIII). Before this suite the shard check matched
// `^status: picked-up$` against the WHOLE file, so an entry whose frontmatter
// read `status: open` satisfied the obligation as long as its body quoted the
// two stamp lines while discussing them. Measured at 02f3c68, scout row 9.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { hasClosureStamp } from '../.claude/hooks/lib/closure-check.mjs';

const STAMPED = `---
key: some-entry-1a2b
category: backlog
status: picked-up
superseded-at: 2026-09-03
---

- The fix landed in this cycle.
`;

const OPEN = `---
key: some-entry-1a2b
category: backlog
status: open
---

- Still open.
`;

const FORGED = `---
key: some-entry-1a2b
category: backlog
status: open
---

- We agreed the entry should eventually read:
status: picked-up
superseded-at: 2026-09-03
- but nobody has done the work yet.
`;

describe('backlog closure stamp', () => {
  // covers AC-018
  test('test_when_the_stamp_is_in_the_frontmatter_then_the_obligation_is_satisfied', () => {
    assert.equal(hasClosureStamp(STAMPED), true);
  });

  // covers AC-018
  test('test_when_the_entry_is_open_then_the_obligation_is_unsatisfied', () => {
    assert.equal(hasClosureStamp(OPEN), false);
  });

  // covers AC-018
  test('test_when_the_stamp_is_only_in_the_body_then_the_obligation_is_unsatisfied', () => {
    assert.equal(
      hasClosureStamp(FORGED),
      false,
      'the pre-fix reader matched the body and reported the commit obligation satisfied',
    );
  });

  // covers AC-018
  test('test_when_superseded_at_is_missing_then_the_obligation_is_unsatisfied', () => {
    assert.equal(hasClosureStamp(STAMPED.replace(/^superseded-at:.*$/m, '')), false);
  });

  // covers AC-018
  test('test_when_there_is_no_frontmatter_then_the_obligation_is_unsatisfied', () => {
    assert.equal(hasClosureStamp('status: picked-up\nsuperseded-at: 2026-09-03\n'), false);
    assert.equal(hasClosureStamp(''), false);
    assert.equal(hasClosureStamp(null), false);
  });
});
