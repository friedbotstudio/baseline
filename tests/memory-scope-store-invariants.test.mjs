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
const PHASE_BUDGETS = { spec: 71, security: 30, research: 20 };

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
const PATH_LEG_BASELINE = {
  '.claude/hooks/lib/scoped-memory.mjs': 8,
  '.claude/skills/memory-index/resolve.mjs': 12,
  '.claude/hooks/process_lifecycle_guard.mjs': 8,
  // 5 -> 8, in two steps, both from the same cohort. The dispatcher-sweep workflow
  // filed four backlog entries and left them uncommitted; harness-batch-fixes
  // committed them. Three of the four carried only `key` and `category`, so they
  // were unreachable by either leg and `scope-narrow check` failed the moment they
  // became tracked. Giving them the `governs:` globs their bodies already describe
  // fixed that and raised this count.
  //
  // A governed-memory count is a census, not an invariant: it moves whenever an
  // entry's `governs:` legitimately names a new path. Re-measure it; do not defend it.
  '.claude/skills/harness/checker-fanout.mjs': 9,
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

    assert.equal(
      atScout.length,
      89,
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
