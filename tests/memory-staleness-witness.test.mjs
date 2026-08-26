import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { isStaleFromFields, STALE_DAYS, governsMatches, usableStamp, needsChangedSet } from '../.claude/hooks/lib/staleness.mjs';

const TODAY = new Date('2026-08-23');

function daysAgo(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// A landmark is in neither exempt class, so it exercises both legs.
function landmark(over = {}) {
  return {
    category: 'landmarks',
    hasClosure: false,
    governs: ['.claude/skills/roadmap-sync/sync.mjs'],
    lastTouched: daysAgo(2),
    changedPaths: [],
    today: TODAY,
    ...over,
  };
}

// --- the witness leg ---------------------------------------------------------

test('test_when_governed_path_changed_then_entry_is_stale', () => {
  const stale = isStaleFromFields(landmark({
    changedPaths: ['.claude/skills/roadmap-sync/sync.mjs', 'README.md'],
  }));
  assert.equal(stale, true);
});

test('test_when_nothing_governed_changed_then_entry_is_fresh', () => {
  const stale = isStaleFromFields(landmark({
    changedPaths: ['README.md', 'docs/roadmap-execution-plan.md', 'site-src/memory.njk'],
  }));
  assert.equal(stale, false, 'elapsed commits alone no longer expire an entry');
});

test('test_when_governs_glob_matches_nested_path_then_stale', () => {
  const base = { governs: ['.claude/skills/lib/**'] };
  assert.equal(
    isStaleFromFields(landmark({ ...base, changedPaths: ['.claude/skills/lib/a/b.mjs'] })),
    true,
  );
  assert.equal(
    isStaleFromFields(landmark({ ...base, changedPaths: ['.claude/skills/other.mjs'] })),
    false,
  );
});

// --- the date fallback -------------------------------------------------------

test('test_when_no_governs_and_recently_touched_then_fresh', () => {
  const stale = isStaleFromFields(landmark({
    governs: [],
    lastTouched: daysAgo(5),
    changedPaths: ['.claude/skills/roadmap-sync/sync.mjs'],
  }));
  assert.equal(stale, false);
});

test('test_when_no_governs_and_thirty_days_old_then_stale', () => {
  const stale = isStaleFromFields(landmark({
    governs: [],
    lastTouched: daysAgo(STALE_DAYS),
    changedPaths: [],
  }));
  assert.equal(stale, true);
});

test('test_when_changed_paths_unavailable_then_falls_back_to_date_leg', () => {
  // null stands for every case the caller could not resolve: verified-at HEAD,
  // a non-git project, a failed git call. It must never read as "nothing moved".
  assert.equal(
    isStaleFromFields(landmark({ changedPaths: null, lastTouched: daysAgo(STALE_DAYS) })),
    true,
  );
  assert.equal(
    isStaleFromFields(landmark({ changedPaths: null, lastTouched: daysAgo(2) })),
    false,
  );
});

// --- exemptions stay exactly as they are -------------------------------------

test('test_when_category_is_stale_exempt_then_never_stale', () => {
  const stale = isStaleFromFields(landmark({
    category: 'backlog',
    changedPaths: ['.claude/skills/roadmap-sync/sync.mjs'],
    lastTouched: daysAgo(400),
  }));
  assert.equal(stale, false);
});

test('test_when_category_is_supersession_driven_then_never_stale', () => {
  const stale = isStaleFromFields(landmark({
    category: 'decisions',
    changedPaths: ['.claude/skills/roadmap-sync/sync.mjs'],
    lastTouched: daysAgo(400),
  }));
  assert.equal(stale, false);
});

test('test_when_closure_field_present_then_not_stale', () => {
  const stale = isStaleFromFields(landmark({
    hasClosure: true,
    changedPaths: ['.claude/skills/roadmap-sync/sync.mjs'],
  }));
  assert.equal(stale, false);
});

// --- the collapse the workflow exists to make --------------------------------

const THRESHOLD_ASSIGNMENT = /^\s*(?:const|let|var|export const)\s+STALE_(?:COMMITS|DAYS)\s*=/m;

function mjsFilesUnder(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'tests') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) mjsFilesUnder(p, out);
    else if (name.endsWith('.mjs') || name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('test_when_tree_scanned_then_only_one_module_defines_the_staleness_threshold', () => {
  const definers = [...mjsFilesUnder('.claude/hooks'), ...mjsFilesUnder('.claude/skills')]
    .filter((p) => THRESHOLD_ASSIGNMENT.test(readFileSync(p, 'utf8')));
  assert.deepEqual(definers, ['.claude/hooks/lib/staleness.mjs'],
    'the threshold is a shared rule; a second copy is what drifted before');
});

// --- the security review's two findings --------------------------------------

test('test_when_verified_at_is_an_option_then_it_never_reaches_git', () => {
  // Measured 2026-08-23: `verified-at: --output=<path>` made `git diff` write its
  // output to <path>..HEAD and exit 0, so the predicate reported a normal verdict
  // while an arbitrary file appeared. git parses a leading `-` as an option; a `--`
  // terminator does not help, because the injected text IS the revision argument.
  assert.equal(usableStamp('--output=/tmp/pwned'), false);
  assert.equal(usableStamp('-p'), false);
  assert.equal(usableStamp('HEAD'), false);
  assert.equal(usableStamp('unverified'), false);
  assert.equal(usableStamp('f9e7071..HEAD; rm -rf /'), false);
  assert.equal(usableStamp(''), false);
  assert.equal(usableStamp(null), false);

  assert.equal(usableStamp('f9e7071'), true);
  assert.equal(usableStamp('2542786'), true);
  assert.equal(usableStamp('a'.repeat(40)), true);
  assert.equal(usableStamp('abc123'), false, 'six chars is shorter than a git short SHA');
});

test('test_when_governs_glob_is_refused_then_the_predicate_falls_back_rather_than_throwing', () => {
  // glob-match refuses an uncompilable glob with a RangeError, deliberately, so other
  // callers can tell it apart from "no match". Neither session-start call site wraps
  // isStale, so one malformed entry would abort the whole staleness pass.
  const refused = Array.from({ length: 80 }, () => '**').join('/') + '/x';

  const recent = landmark({ governs: [refused], changedPaths: ['a/b/c.mjs'], lastTouched: daysAgo(2) });
  assert.equal(isStaleFromFields(recent), false, 'an uncompilable glob is no match, then the date leg decides');

  const old = landmark({ governs: [refused], changedPaths: ['a/b/c.mjs'], lastTouched: daysAgo(STALE_DAYS) });
  assert.equal(isStaleFromFields(old), true);

  assert.equal(governsMatches([refused], ['a/b/c.mjs']), false, 'the refusal is absorbed here, not re-thrown');
});

// --- needsChangedSet (AC-001): do not pay git for an answer nothing reads ---
//
// isStaleFromFields returns before it touches `changedPaths` in four cases. On the
// live store at 7fd51c0 those four covered 314 of 433 stamped entries, and every
// one of them spawned a `git diff` whose result was then discarded.
//
// The claim these tests defend is an equivalence, not a heuristic: for an entry
// meeting any of the four, the verdict is the same whether changedPaths holds the
// computed array or null.

test('test_when_category_is_stale_exempt_then_changed_set_not_needed', () => {
  assert.equal(needsChangedSet({ category: 'backlog', hasClosure: false, governs: ['.claude/**'] }), false);
});

test('test_when_category_is_supersession_driven_then_changed_set_not_needed', () => {
  assert.equal(needsChangedSet({ category: 'decisions', hasClosure: false, governs: ['.claude/**'] }), false);
});

test('test_when_closure_field_present_then_changed_set_not_needed', () => {
  assert.equal(needsChangedSet({ category: 'landmarks', hasClosure: true, governs: ['.claude/**'] }), false);
});

test('test_when_governs_is_empty_then_changed_set_not_needed', () => {
  // witness() returns null on an empty governs before it looks at its second
  // argument, so the changed-set cannot affect the answer.
  assert.equal(needsChangedSet({ category: 'landmarks', hasClosure: false, governs: [] }), false);
});

test('test_when_entry_has_governs_and_no_closure_then_changed_set_is_needed', () => {
  assert.equal(needsChangedSet({ category: 'landmarks', hasClosure: false, governs: ['.claude/a.mjs'] }), true);
});

test('test_when_category_is_unrecognised_then_changed_set_is_needed', () => {
  // Fail open. An unknown category might be neither exempt nor supersession-driven,
  // and computing an answer nobody reads is cheap next to skipping one that matters.
  assert.equal(needsChangedSet({ category: 'not-a-real-category', hasClosure: false, governs: ['.claude/a.mjs'] }), true);
});

test('test_when_needs_changed_set_is_false_then_verdict_matches_a_computed_changed_set', () => {
  const computed = ['.claude/a.mjs'];
  const shortCircuits = [
    { category: 'backlog', hasClosure: false, governs: ['.claude/a.mjs'] },
    { category: 'decisions', hasClosure: false, governs: ['.claude/a.mjs'] },
    { category: 'landmarks', hasClosure: true, governs: ['.claude/a.mjs'] },
    { category: 'landmarks', hasClosure: false, governs: [] },
  ];

  for (const fields of shortCircuits) {
    assert.equal(needsChangedSet(fields), false, `${fields.category} should short-circuit`);
    const base = { ...fields, lastTouched: daysAgo(STALE_DAYS + 1), today: TODAY };
    assert.equal(
      isStaleFromFields({ ...base, changedPaths: null }),
      isStaleFromFields({ ...base, changedPaths: computed }),
      `${fields.category}: skipping the git call must not change the verdict`,
    );
  }
});
