// Scenarios asserting the LIVE store after curation — AC-004, AC-005, AC-007,
// AC-009, AC-010 of docs/specs/memory-scope-per-entry.md, plus two regression
// traps. Covers §Behavior #1 and §Behavior #3.
//
// These read the real .claude/memory and never mutate it. Every failure reports a
// NAMED LIST rather than a count: `assert.equal(offenders.length, 0)` prints
// "47 !== 0" and tells the curator nothing about which entries to open.
//
// RED until the curation pass lands.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  REPO_ROOT,
  makeProject,
  writeShard,
  tryImport,
  everyShardFile,
  readFileSync,
} from './helpers/memory-fixtures.mjs';

const LIVE_MEM = join(REPO_ROOT, '.claude/memory');
const NARROW_CLI = '.claude/skills/memory-index/scope-narrow.mjs';
const LANDMINE_CATEGORY_DEFAULT = '[scout, spec, tdd, security, integrate]';

// The budgets AC-007 commits to. `scout` is deliberately absent: AC-009 defers the
// landmarks that make up most of its hits, so a scout budget would either force
// that deferred re-homing or record a number this cycle does not move.
//
// spec moved 65 -> 67 at 79e41cb, which added three correctly-scoped entries:
// `backlog/memory-index-ships-unhashed-while-being-a-shared-oracle-d5b6` and
// `backlog/shipped-subdirs-under-flat-scan-descriptors-go-unscanned-a3f8` (both
// `scope: [spec]`), and `decisions/strict-dev-path-scan-is-scoped-to-shipped-
// commands-5e19` (`scope: [spec, implement]`). Legitimate growth, not mis-scoping —
// so the cap moves rather than the entries.
//
// Expect this to recur on a schedule. Backlog entries default to `[spec]` and a
// workflow files backlog entries routinely, so the spec cap drifts every few
// landings. A cap re-measured to the exact current value also has zero headroom,
// which makes it behave as a tripwire rather than a budget. The real fix is to
// measure surfaced VOLUME rather than entry count — an entry count says nothing
// about the context cost the budget exists to bound.
//
// 67 -> 68 in the SAME workflow, at its /memory-sync flush, when a decision entry
// landed with `scope: [spec, implement, simplify]`. Two bumps in one workflow is
// the tripwire behaviour predicted three paragraphs up, demonstrated inside the
// prediction's own cycle. The number is left at the measured value rather than
// padded, because inventing headroom is a policy change and this is a test file.
// Deciding what this cap should actually measure is the open question.
// 68 -> 69 when /retrospective filed `a-checker-aimed-one-axis-off-passes-loudly`
// at `scope: [spec, scenario, implement, simplify, integrate]`. Third bump of this
// literal in one session. See the note on PATH_LEG_BASELINE below: the same single
// entry moved two path-leg counts as well, which is what a broad `governs:` glob
// does to every census that intersects it.
// 69 -> 71 at the `contracts-rows-resolve-at-drift-check` flush, which filed one
// decision and one landmine at `scope: [spec, implement, integrate]`. Fifth bump of
// this literal in one session, and the fifth is the useful one: the PATH-leg
// literals below did NOT move this time, because those entries were given narrow
// `governs:` (named modules) rather than a `.claude/skills/**` glob. The blast
// radius of a memory write is a choice — see the landmine
// `a-wide-governs-glob-ripples-into-unrelated-literals`.
//
// AC-002 (release-readiness) — budget leg, raised with stated headroom.
// 71 -> 88, and this bump breaks the pattern above deliberately. Measured 73 at
// HEAD 66fcb29 by the `release-readiness` batch. Every prior bump set the cap to
// the measured value on the stated ground that inventing headroom is a policy
// change — and each one produced a zero-headroom tripwire that the next flush
// tripped, five times in one session. Re-measuring to 73 would have been the
// sixth.
//
// 88 is 73 plus roughly 20% room, which is a policy call and named as one here
// rather than smuggled in as a measurement. It buys about fifteen entries before
// anyone has to look at this line again. What the cap SHOULD measure is still
// open — surfaced volume rather than entry count, since a count says nothing
// about the context cost the budget exists to bound — and that decision is its
// own ticket, recorded in the spec's Open questions. This is the repair, not the
// answer.
// 88 -> 89 at staleness-witness (2026-08-24). The 20% headroom above is now spent:
// 88 was 73 plus room for about fifteen entries, and sixteen have landed. Verified by
// enumeration, not assumed — `git grep -l '^scope: \[.*spec' HEAD -- .claude/memory/`
// returns 88 and the worktree returns 89, the one addition being
// `backlog/delta-fold-writes-a-degraded-shard-for-every-new-element-7f3a.md`. That
// entry keeps `spec` scope deliberately: it is about what the delta fold writes for a
// `## System delta` row, so the spec phase is where it has to surface, and narrowing it
// to `archive` to stay under the cap would hide it from the only reader who can act on
// it at the right time.
//
// This bump buys nothing. The next entry trips the same line, which is the signal that
// the open question above — measure surfaced volume, not entry count — is now due
// rather than deferrable.
const PHASE_BUDGETS = { spec: 89, security: 30, research: 20 };

// Captured at HEAD 2bf79ef. The phase leg is what this spec rewrites; the path leg
// must not drift except where the curation deliberately ADDS a `governs:` to an
// entry that had none (13 of the 47 placeholder entries got one, per D2/D3).
//
// process_lifecycle_guard.mjs moved 7 -> 8, and the 8th is exactly
// `backlog/advisory-block-interpolates-an-unsanitised-file-path-8c7e`, a backlog item
// about that file which previously reached nothing. Verified by enumeration, not
// assumed. The other three are unchanged and are what pin the leg against real drift.
// resolve.mjs moved 10 -> 11 at b164ae7 (`feat(memory): scope is per entry, and an
// unreachable entry is refused`), which added the landmark
// `landmarks/claude-skills-memory-index-scope-narrow-mjs`. That workflow did not
// refresh this literal, so the suite has been red on main since. Identified by
// enumerating all 11 hits and checking each one's add-commit against 2bf79ef —
// verified, not assumed, same as the 7 -> 8 note above.
//
// This is the failure mode backlog `replace-the-corpus-census-literals-with-a-
// relational-assertion` exists to end: a hand-maintained count drifts the moment
// any workflow adds a governing entry, and it fails in a workflow that had nothing
// to do with it. Bumping the literal keeps the trap; the backlog entry is the fix.
// ONE entry moved two of these four at once. `a-checker-aimed-one-axis-off-passes-
// loudly` declares `governs: tests/**, .claude/skills/**`, and that second glob
// covers `resolve.mjs` (11 -> 12) and `checker-fanout.mjs` (8 -> 9) alike. A broad
// `governs:` ripples into every census it intersects, which is worth knowing before
// writing one: the cost of a wide glob is paid in literals somebody re-measures
// later, not at the moment it is authored.
// AC-002 (release-readiness) — census leg, re-measured.
// Re-measured 2026-08-14 at HEAD 66fcb29 by the `release-readiness` batch, which
// found all four drifted and the suite red on main. Re-measuring is the whole of
// the repair here — this is a CENSUS, and the comment above says so: it moves
// whenever an entry's `governs:` legitimately names a new path.
//
// What changed with this batch is who pays. `/memory-sync` now runs the census
// gate before it writes, so the flush that moves one of these values re-measures
// it in the same commit or refuses. The bump history above — five in one session,
// each discovered by a later workflow that had nothing to do with it — is the
// cost that gate removes.
const PATH_LEG_BASELINE = {
  // 9 -> 10 at c92f82a, the Epic 6 T11 landing. That workflow filed the landmark
  // `.claude/hooks/lib/write-surface.mjs`, whose `governs:` names this module
  // directly — the new relevance filter reads the surface here, so someone editing
  // this file should see the landmark for the module it consults. A census moving
  // because a genuinely related fact was filed is the mechanism working; the number
  // is re-measured, never defended.
  //
  // 10 -> 11 at 309d70e, which filed the landmine
  // `a-global-regex-with-test-fails-open-on-alternate-calls` with a `.claude/hooks/**`
  // glob. That one entry moved BOTH path-leg literals here by one — the broad-glob
  // blast radius the note above the census literal describes.
  //
  // 11 -> 12 at 5f52ba2, the memory re-verification sweep. Re-verifying
  // `security-fixes-are-per-call-site-and-new-modules-inherit-none` found its
  // `governs:` named four `.claude/skills/**` trees and not `.claude/hooks/lib/**`,
  // so it surfaced at zero phases for a new writer added under hooks — the exact
  // failure the entry itself describes. Widening it to cover that tree is the
  // repair, and this literal moving by one is the widening being visible. Only
  // this path moved: `resolve.mjs` and `process_lifecycle_guard.mjs` sit outside
  // `.claude/hooks/lib/**`.
  '.claude/hooks/lib/scoped-memory.mjs': 12,
  '.claude/skills/memory-index/resolve.mjs': 16,
  // 9 -> 10 at 309d70e, the same single landmine reaching a second path through the
  // same `.claude/hooks/**` glob. Both bumps have one cause; neither is defended.
  // Back to 9 at the baseline-mcp landing: `/memory-sync` auto-closed
  // `backlog/advisory-block-interpolates-an-unsanitised-file-path-8c7e` on its
  // `superseded-at` stamp, and that entry is the very 8th hit the note above this
  // census names. A closed entry leaving the store is the census moving for the
  // reason a census exists, so this is re-measured rather than defended.
  '.claude/hooks/process_lifecycle_guard.mjs': 9,
  // 5 -> 8, in two steps, both from the same cohort. The dispatcher-sweep workflow
  // filed four backlog entries and left them uncommitted; harness-batch-fixes
  // committed them. Three of the four carried only `key` and `category`, so they
  // were unreachable by either leg and `scope-narrow check` failed the moment they
  // became tracked. Giving them the `governs:` globs their bodies already describe
  // fixed that and raised this count.
  //
  // A governed-memory count is a census, not an invariant: it moves whenever an
  // entry's `governs:` legitimately names a new path. Re-measure it; do not defend it.
  //
  // 15 -> 14 at 1b2b0c7, where /memory-sync auto-closed twelve backlog entries that
  // already carried a superseded-at stamp. One of them —
  // `code-review-fanout-runs-with-empty-changedfiles-and-reports-clean` — governed
  // this module, so its closure removed a hit. A closure moves a census downward the
  // same way a filing moves it up; both are re-measured, neither is defended.
  //
  // The re-measure was made BY HAND again, for the reason the landmark-scope comment
  // below already records: the census gate's literalPattern matches `SYMBOL = <digits>`
  // and this site is an object property. Backlog
  // `census-gate-literal-pattern-matches-no-real-site` carries that repair.
  // 14 -> 13 at 4c4836c, the `changedfiles-shape-contract` landing. Its closing
  // commit stamped `1. \`ctx.changedFiles\` has two readers that disagree on its
  // shape` as picked-up, and the next auto-close sweep deleted it. That entry's
  // `governs:` named this module — it is the backlog entry this landing fixed — so
  // closing it removed a hit. Second downward move of this same literal from the
  // same cause, and re-measured by hand for the same reason: the census gate's
  // literalPattern matches `SYMBOL = <digits>`, never an object property.
  //
  // AC-005 and AC-010 of docs/specs/stale-keying-and-glob-scope.md.
  //
  // 13 -> 14 at the `stale-keying-and-glob-scope` landing. Mechanism A now resolves its
  // path signal through the shared helper, which carries the path-shaped-`key:` fallback
  // it never had (spec D7). The new hit is the landmark keyed
  // `.claude/skills/harness/checker-fanout.mjs` — a fact about this exact file that had
  // never surfaced on an edit to it, because it declares no path field and only 8 of 92
  // category-default landmarks do. A widening, re-measured rather than defended.
  '.claude/skills/harness/checker-fanout.mjs': 14,
};

function liveShards() {
  return everyShardFile(LIVE_MEM);
}

function frontmatterOf(file) {
  const parts = readFileSync(file, 'utf8').split(/^---$/m);
  return parts.length >= 2 ? parts[1] : '';
}

function scopeLineOf(file) {
  const match = /^scope:(.*)$/m.exec(frontmatterOf(file));
  return match ? match[1].trim() : null;
}

function relative(file) {
  return file.slice(LIVE_MEM.length + 1);
}

function governsOf(file) {
  const match = /^governs:(.*)$/m.exec(frontmatterOf(file));
  return match ? match[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function keyOf(file) {
  const match = /^key:(.*)$/m.exec(frontmatterOf(file));
  return match ? match[1].trim() : null;
}

// Nine entries carried `governs: tests/**` at 5f52ba2, so a commit touching any test
// file re-staled all nine at once. A stale queue that fires on every test edit stops
// distinguishing "this entry's subject moved" from "a test changed somewhere", which
// is the same signal-death the commit-distance leg had before witnessed staleness
// replaced it.
//
// The curator narrowed five and deliberately kept three. The rule applied: `governs:`
// answers "what change should make me re-check this entry", NOT "where does this
// advice apply". The five have file-specific evidence; the three are advice about any
// red test and have no narrower oracle, which the backlog entry allows for — "some
// genuinely describe test-suite-wide conventions and a broad glob is honest for them".
//
// The allowlist is the point of this test. Without it the assertion reads as "no entry
// may say tests/**", which is not the policy and would be repaired by re-widening the
// five. Re-measure with:
//   grep -rl '^governs:.*tests/\*\*' .claude/memory
const NARROWED_OFF_TESTS_GLOB = [
  'claude-skills-lib-tests-is-executed-by-nothing',
  'a-check-that-measured-nothing-reports-success',
  'a-cycle-that-adds-a-gate-must-assert-the-consumer-calls-it',
  'a-checker-aimed-one-axis-off-passes-loudly',
];

// SUPERSEDED by the split. This table recorded a trade that no longer has to be made.
//
// `governs:` used to serve two purposes with opposite pressures — staleness witness
// (narrow) and surfacing audience (wide) — so an entry whose evidence and audience
// differed had to pick one, and this table is where each pick was recorded.
//
// `surfaces-on:` now carries the audience and `governs:` keeps the witness, so all
// four entries below hold the WIDE value in `surfaces-on:` and a narrow `governs:`.
// They are asserted by `test_when_the_four_entries_are_read_then_each_declares_a_narrow_governs_and_a_wide_surfaces_on`
// above. What remains here is the guard that they still reach their audience.
const TESTS_GLOB_KEPT_DELIBERATELY = {
  'a-red-pre-existing-test-may-be-a-contract-conflict': 'how to repair ANY red pre-existing assertion',
  'a-retrofit-guard-is-proven-by-re-breaking-what-it-guards': 'how to prove ANY retrofit guard is connected',
  'census-and-budget-are-different-numbers': 'how to classify ANY red numeric literal in a test',
  // Narrowed to tests/control-bytes.test.mjs on 2026-08-27 and REVERTED the same run.
  // It is load_bearing, it has recurred four times — the fourth inside a memory file
  // while its own author was documenting it — and its body records that it "governed
  // .claude/** when the trap recurred". Narrowing it stopped it surfacing to anyone
  // editing .claude/**, which is precisely where it recurs. The 4 governs-hit counts
  // in PATH_LEG_BASELINE each dropped by one and named the cost out loud.
  'grep-reports-no-match-on-utf8-files-it-calls-binary': 'a silent trap in ANY tracked text file',
};

// AC-001, AC-003, AC-009 of docs/specs/stale-keying-and-glob-scope.md.
// Covers §Behavior #1.
//
// These four are the entries the earlier narrowing pass could NOT fix. Each needs a
// wide path glob to keep surfacing and a narrow one to stop churning, and one field
// cannot be both. After the split each declares a narrow `governs:` (staleness) and a
// wide `surfaces-on:` (audience), and the churn goes to zero.
//
// Re-measure the churn with:
//   node -e "import('./.claude/hooks/lib/staleness.mjs').then(m => console.log(
//     m.governsMatches(m.splitList('<governs value>'), ['tests/some-unrelated-suite.test.mjs'])))"
const SPLIT_ENTRIES = [
  'a-red-pre-existing-test-may-be-a-contract-conflict',
  'a-retrofit-guard-is-proven-by-re-breaking-what-it-guards',
  'census-and-budget-are-different-numbers',
  'grep-reports-no-match-on-utf8-files-it-calls-binary',
];

// One edit to one unrelated repo-root test file — the exact churn the source backlog
// entry names. Not a string match on the glob: `.claude/skills/lib/tests/**` contains
// the characters `tests/**` and is NOT wide, which is how an earlier count read 5
// where the predicate said 4.
const UNRELATED_TEST_EDIT = ['tests/some-unrelated-suite.test.mjs'];

function surfacesOnOf(file) {
  const match = /^surfaces-on:(.*)$/m.exec(frontmatterOf(file));
  return match ? match[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function shardFor(key) {
  return liveShards().find((f) => keyOf(f) === key);
}

describe('memory scope — the split ends the churn without narrowing the audience', () => {
  it('test_when_an_unrelated_test_file_changes_then_none_of_the_four_entries_are_restaled', async () => {
    const staleness = await tryImport('.claude/hooks/lib/staleness.mjs');
    assert.ok(staleness, 'staleness.mjs must import cleanly');

    const churning = SPLIT_ENTRIES.filter((key) => {
      const file = shardFor(key);
      if (!file) return true;
      return staleness.isStaleFromFields({
        category: 'landmines',
        governs: governsOf(file),
        lastTouched: '2026-08-27',
        changedPaths: UNRELATED_TEST_EDIT,
      });
    });

    assert.deepEqual(
      churning, [],
      'a stale queue that fires on every test edit stops distinguishing "check this entry" from '
      + '"a test changed somewhere", which is the signal-death witnessed staleness replaced commit-distance to avoid',
    );
  });

  it('test_when_the_four_entries_are_read_then_each_declares_a_narrow_governs_and_a_wide_surfaces_on', async () => {
    const staleness = await tryImport('.claude/hooks/lib/staleness.mjs');
    assert.ok(staleness, 'staleness.mjs must import cleanly');

    const broken = [];
    for (const key of SPLIT_ENTRIES) {
      const file = shardFor(key);
      if (!file) { broken.push(`${key}: shard not found`); continue; }
      const governs = governsOf(file);
      const surfacesOn = surfacesOnOf(file);
      if (!surfacesOn.length) broken.push(`${key}: no surfaces-on — its audience is undeclared`);
      if (staleness.governsMatches(governs, UNRELATED_TEST_EDIT)) {
        broken.push(`${key}: governs still matches an unrelated test edit`);
      }
    }

    assert.deepEqual(
      broken, [],
      'each entry must end up narrow for staleness AND wide for surfacing; declaring only one half '
      + 'trades the churn for silence, which is the trap that forced the grep-landmine revert',
    );
  });
});

describe('memory scope — a wide tests glob no longer re-stales unrelated entries', () => {
  it('test_when_the_store_is_scanned_then_no_narrowed_entry_declares_a_bare_tests_glob', () => {
    const offenders = liveShards()
      .filter((f) => NARROWED_OFF_TESTS_GLOB.includes(keyOf(f)))
      .filter((f) => governsOf(f).includes('tests/**'))
      .map(relative);

    assert.deepEqual(
      offenders, [],
      'each of these entries has file-specific evidence, so a bare tests/** re-verifies it on every '
      + 'unrelated test edit and never on the change that actually moves its subject',
    );
  });

  it('test_when_the_deliberately_kept_entries_are_scanned_then_they_still_declare_it', () => {
    // Guards the narrowing from overshooting into "no entry may ever say tests/**".
    // These four have no narrower AUDIENCE; the broad glob is the honest answer, and
    // after the split it lives in `surfaces-on:` rather than in `governs:`.
    const missing = Object.keys(TESTS_GLOB_KEPT_DELIBERATELY).filter((key) => {
      const file = liveShards().find((f) => keyOf(f) === key);
      if (!file) return true;
      const audience = surfacesOnOf(file);
      return !audience.some((glob) => glob === 'tests/**' || glob === '.claude/**');
    });

    assert.deepEqual(
      missing, [],
      'these entries are advice about any test, not about a named file; narrowing their AUDIENCE '
      + 'would stop them reaching the readers who need them — the trade the split removed',
    );
  });

  it('test_when_an_unrelated_test_file_changes_then_a_narrowed_entry_is_not_restaled', async () => {
    const staleness = await tryImport('.claude/hooks/lib/staleness.mjs');
    assert.ok(staleness, 'staleness.mjs must import cleanly');

    const changedPaths = ['tests/some-unrelated-suite.test.mjs'];
    const fields = { category: 'landmines', lastTouched: '2026-08-27', changedPaths };

    assert.equal(
      staleness.isStaleFromFields({ ...fields, governs: ['tests/**'] }), true,
      'the defect, stated: a bare tests/** witnesses any test edit as movement in this entry',
    );
    assert.equal(
      staleness.isStaleFromFields({ ...fields, governs: ['tests/control-bytes.test.mjs'] }), false,
      'the narrowed form witnesses only the gate that actually closes this entry',
    );
  });
});

describe('memory scope — no entry is left unreachable or placeheld (AC-004)', () => {
  it('test_when_scope_narrow_check_runs_over_live_store_then_exit_zero', () => {
    const res = spawnSync('node', [join(REPO_ROOT, NARROW_CLI), 'check'], { cwd: REPO_ROOT, encoding: 'utf8' });

    assert.equal(
      res.status,
      0,
      `scope-narrow check must exit 0 over the live store; it reported:\n${res.stdout ?? ''}${res.stderr ?? ''}`,
    );
  });

  it('test_when_live_store_scanned_then_no_entry_carries_the_any_placeholder', () => {
    const offenders = liveShards().filter((f) => scopeLineOf(f) === 'any').map(relative);

    assert.deepEqual(
      offenders,
      [],
      '`scope: any` matches no phase in scoped-memory.mjs, so every entry carrying it is reachable by nothing',
    );
  });
});

describe('memory scope — the category default is gone from landmines (AC-005)', () => {
  it('test_when_landmines_scanned_then_none_carries_the_five_phase_default', () => {
    const offenders = liveShards()
      .filter((f) => f.includes(`${'landmines'}/`))
      .filter((f) => scopeLineOf(f) === LANDMINE_CATEGORY_DEFAULT)
      .map(relative);

    assert.deepEqual(offenders, [], 'each landmine is narrowed to a strict subset of the migration default');
  });
});

describe('memory scope — measured phase budgets (AC-007)', () => {
  it('test_when_phase_budgets_measured_then_within_stated_caps', async () => {
    const mod = await tryImport('.claude/hooks/lib/scoped-memory.mjs');
    assert.ok(mod, 'scoped-memory.mjs must be importable');

    const over = Object.entries(PHASE_BUDGETS)
      .map(([phase, budget]) => ({ phase, budget, actual: mod.surfaceScopedMemory(phase, { rootDir: REPO_ROOT }).length }))
      .filter(({ actual, budget }) => actual > budget)
      .map(({ phase, actual, budget }) => `${phase}: ${actual} > ${budget}`);

    assert.deepEqual(over, [], 'a phase over budget is named with its actual count, not just flagged');
  });
});

describe('memory scope — the landmark deferral is enforced, not assumed (AC-009)', () => {
  // 87 -> 88 at 79e41cb, which added
  // `landmarks/src-memory-constraints-template-md-1.md` carrying `scope: [scout]`.
  // Verified by enumeration, not assumed: `git log -1 --` on that file returns
  // 79e41cb, and `git grep -l "^scope: \[scout\]" HEAD -- .claude/memory/landmarks/`
  // returns 88 at HEAD. Same shape as the PATH_LEG_BASELINE bumps above.
  //
  // A relational assertion CANNOT replace this literal — checked, so nobody
  // re-opens it. The 120 landmark shards carry seven distinct scope values: 88
  // `[scout]`, 25 `[]`, and 7 others, of which `[document]`, `[spec, tdd, archive]`
  // and `[spec, tdd]` omit scout entirely. So neither "every landmark is [scout]"
  // nor "every scoped landmark includes scout" holds; the deferral this test
  // defends has already been partially and legitimately overtaken, and the count
  // is the only oracle left.
  //
  // The number is out of the test NAME for that reason: it forced a rename on this
  // bump and would force another on the next.
  //
  // 88 -> 89 later the same day, at this workflow's /memory-sync flush, when the
  // landmark for `restore-degraded-shards.mjs` landed at `scope: [scout]`. The
  // rename paid for itself within one workflow.
  it('test_when_landmark_scope_counted_then_the_deferred_set_is_unchanged', () => {
    const atScout = liveShards()
      .filter((f) => f.includes(`${'landmarks'}/`))
      .filter((f) => scopeLineOf(f) === '[scout]');

    // AC-002 (release-readiness) — census leg, roadmap-committed count re-measured.
    // 89 -> 91 at HEAD 66fcb29, then 91 -> 94 at this workflow's own /memory-sync,
    // which filed three landmarks for the modules it added. A census, so it moves
    // whenever a workflow files a landmark — and it is also a roadmap commitment:
    // Epic 6 T11 owns re-homing this set, and the assertion is what stops the
    // deferral drifting closed unnoticed.
    //
    // The 91 -> 94 bump was made BY HAND, and that is the finding. The census gate
    // this same batch shipped is supposed to remove exactly this edit, and it could
    // not: its literalPattern matches only `SYMBOL = <digits>`, and this site is an
    // assert.equal argument. It refused rather than re-measured — safe, but blind.
    // Backlog `census-gate-literal-pattern-matches-no-real-site` carries the repair.
    //
    // 94 -> 92 at the 248-entry stale sweep (2026-08-14). Two `scope: [scout]`
    // landmarks were DELETED because their subjects are gone, not re-homed:
    // `.claude/memory/backlog.md:1` (the store sharded, so that path is now a
    // directory) and `site-src/_includes/install-pill.njk:1` (deleted in d2761fb).
    // The deferral this asserts is untouched — the population shrank, the policy
    // did not. Re-measured by hand again, for the reason the paragraph above gives.
    //
    // 92 -> 93 at `review-gate-input-measurement` (2026-08-26), which filed one
    // landmark for `changed-files-shape.mjs`. Verified as an addition rather than a
    // re-homing: one new shard, zero removed, zero moved off `[scout]`.
    //
    // This one reached CI red, and the reason is worth more than the number. The
    // binding verify runs at `/integrate`; `/memory-sync` writes to the store two
    // phases LATER, and nothing re-runs the suite after it. So a census literal
    // pinned to the store can be broken by a phase that runs after the last thing
    // that could have caught it — no amount of care at integrate helps. Backlog
    // `census-gate-literal-pattern-matches-no-real-site` carries the gate repair;
    // the ordering is the other half.
    assert.equal(
      atScout.length,
      93,
      'D4 defers re-homing landmarks to the path leg (deferred: risk) — scout writes docs/scout/<slug>.md, which no landmark governs, so re-homing would remove landmark surfacing from scout entirely. This asserts the deferral so a later cycle cannot silently re-home them.',
    );
  });
});

describe('memory scope — regression traps', () => {
  it('test_when_path_leg_measured_then_governs_hit_counts_unchanged', async () => {
    const mod = await tryImport('.claude/hooks/lib/governed-memory.mjs');
    assert.ok(mod, 'governed-memory.mjs must be importable');

    const drifted = Object.entries(PATH_LEG_BASELINE)
      .map(([path, expected]) => ({ path, expected, actual: mod.surfaceGovernedMemory(path, { rootDir: REPO_ROOT }).length }))
      .filter(({ actual, expected }) => actual !== expected)
      .map(({ path, actual, expected }) => `${path}: ${actual} (was ${expected})`);

    assert.deepEqual(drifted, [], 'this spec changes the PHASE leg; the path leg Epic 7 slice C built must come through untouched');
  });

  it('test_when_scope_rewritten_then_entry_body_bytes_are_identical', async () => {
    const { memDir } = makeProject();
    const body = ['> verbatim (test, 2026-08-08):', '> a body with `scope:` quoted inside it', '', 'Interpretation prose.'];
    const path = writeShard(memDir, 'landmines', 'body-preserved', {
      key: 'body-preserved',
      fields: { scope: 'any' },
      bodyLines: body,
    });
    const bodyBefore = readFileSync(path, 'utf8').split(/^---$/m).slice(2).join('---');

    const mod = await tryImport('.claude/skills/memory-index/scope-narrow.mjs');
    assert.ok(mod, 'scope-narrow.mjs must be importable');
    mod.applyNarrowing({ path, scope: ['spec'] });

    const after = readFileSync(path, 'utf8');
    assert.equal(after.split(/^---$/m).slice(2).join('---'), bodyBefore, 'a scope rewrite is frontmatter-only');
    assert.match(after, /^scope: \[spec\]$/m, 'the frontmatter scope did change');
    assert.doesNotMatch(frontmatterOfText(after), /^scope: any$/m, 'the placeholder is gone from frontmatter');
  });
});

function frontmatterOfText(text) {
  const parts = text.split(/^---$/m);
  return parts.length >= 2 ? parts[1] : '';
}

describe('memory scope — the docs stop claiming the placeholder confers reachability (AC-010)', () => {
  it('test_when_reachability_docs_read_then_neither_claims_any_confers_reachability', () => {
    const claims = [
      ['.claude/memory/README.md', readFileSync(join(REPO_ROOT, '.claude/memory/README.md'), 'utf8')],
      ['.claude/skills/memory-sync/SKILL.md', readFileSync(join(REPO_ROOT, '.claude/skills/memory-sync/SKILL.md'), 'utf8')],
    ]
      .filter(([, text]) => /scope: any/.test(text))
      .map(([path]) => path);

    assert.deepEqual(
      claims,
      [],
      'README.md:112 said "backfilled to it, so no fact is unreachable" and memory-sync/SKILL.md:208 repeated it, while scoped-memory.mjs:19 honoured neither. Both must now describe the two-leg predicate.',
    );
  });
});
