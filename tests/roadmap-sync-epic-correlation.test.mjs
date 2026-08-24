// T5 — roadmap-sync cannot bind a workflow to a hand-authored epic.
//
// append.mjs derives an epic's identity from the LAST parenthesized group of its
// heading (TAG = /\(([^)]*)\)\s*$/) and calls the epic present only when that tag
// equals the workflow slug. Epics a workflow created are slug-tagged and dedupe
// correctly. Epics a human wrote are tagged by category — (foundation), (module) —
// so they can never match, and nextEpicNumber() appends a duplicate.
//
// Observed downstream: running the epic track over an existing Epic 2 appended a
// duplicate "Epic 15", and seven GitHub issues were then opened under that wrong
// identity. (The tool that opened them is not this repository's — see the report's
// item 8 — but the wrong identity came from here.)
//
// This repo's own epics are all slug-tagged, which is why the maintainer never hit
// it. `roadmap_epic` already exists as an OUTPUT stamp; nothing reads it as input.
//
// RED until: epicPresent accepts a roadmapEpic number and matches an epic by its
// heading NUMBER when one is supplied, leaving the tag path unchanged otherwise.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPEND = join(REPO_ROOT, '.claude/skills/roadmap-sync/append.mjs');

// epicPresent/nextEpicNumber take the whole roadmap TEXT, not a headings array.
// The real failing case, verbatim in shape: a category tag, not a slug.
const HAND_AUTHORED = [
  '# Roadmap',
  '',
  '## Epic 1 — Foundations landed  ✅  (landed)',
  '',
  '## Epic 2 — Input half: the bar gets set  🟡  (foundation)',
  '',
  '## Epic 3 — Enforcement half  ⬜  (module)',
  '',
].join('\n');

const WORKFLOW_AUTHORED = ['# Roadmap', '', '## Epic 9 — Erp portables  ✅  (erp-portables)', ''].join('\n');

describe('AC-010 — roadmap_epic binds a workflow to an existing epic by number', () => {
  it('test_when_roadmap_epic_is_set_then_the_workflow_binds_to_that_epic_by_number', async () => {
    const { epicPresent } = await import(APPEND);

    assert.equal(
      epicPresent(HAND_AUTHORED, 'my-workflow-slug', 2),
      true,
      'an explicit roadmap_epic of 2 must resolve to the heading numbered Epic 2, whatever its tag'
    );
    assert.equal(
      epicPresent(HAND_AUTHORED, 'my-workflow-slug', 3),
      true,
      'the number match is not special-cased to one epic'
    );
  });

  it('test_when_roadmap_epic_names_an_absent_epic_then_it_is_not_present', async () => {
    const { epicPresent } = await import(APPEND);

    assert.equal(
      epicPresent(HAND_AUTHORED, 'my-workflow-slug', 99),
      false,
      'a roadmap_epic naming no heading must report absent, never invent a match'
    );
  });
});

describe('AC-011 — a category-tagged epic is no longer duplicated', () => {
  it('test_when_an_epic_is_category_tagged_then_no_duplicate_is_appended', async () => {
    const { epicPresent, nextEpicNumber } = await import(APPEND);

    // The defect, stated as its consequence: absent the number, the slug never
    // matches a category tag, so the appender allocates a fresh epic.
    assert.equal(
      epicPresent(HAND_AUTHORED, 'my-workflow-slug'),
      false,
      'without roadmap_epic the tag path is unchanged — this is the pre-existing behaviour'
    );
    assert.equal(
      nextEpicNumber(HAND_AUTHORED),
      4,
      'and the appender would allocate the next number, which is how the duplicate was born'
    );

    // With the number supplied, the duplicate cannot happen.
    assert.equal(
      epicPresent(HAND_AUTHORED, 'my-workflow-slug', 2),
      true,
      'supplying roadmap_epic prevents the duplicate append'
    );
  });
});

describe('regression — the tag path is untouched when no number is supplied', () => {
  it('test_when_no_roadmap_epic_is_supplied_then_slug_tag_matching_is_unchanged', async () => {
    const { epicPresent } = await import(APPEND);

    assert.equal(
      epicPresent(WORKFLOW_AUTHORED, 'erp-portables'),
      true,
      'a slug-tagged epic still matches its slug'
    );
    assert.equal(
      epicPresent(WORKFLOW_AUTHORED, 'erp-portables', null),
      true,
      'an explicit null roadmapEpic behaves as if it were omitted'
    );
    assert.equal(
      epicPresent(WORKFLOW_AUTHORED, 'some-other-slug'),
      false,
      'a non-matching slug still reports absent'
    );
  });

  it('test_when_the_plan_is_empty_or_malformed_then_it_answers_without_throwing', async () => {
    const { epicPresent } = await import(APPEND);

    assert.doesNotThrow(() => epicPresent('', 'slug', 2));
    assert.equal(epicPresent('', 'slug', 2), false, 'an empty plan means no match');
    assert.doesNotThrow(() => epicPresent('## not an epic heading', 'slug', 2));
    assert.doesNotThrow(() => epicPresent(null, 'slug', 2));
  });
});
