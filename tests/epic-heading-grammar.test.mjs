// Spec: docs/specs/unify-epic-heading-grammar.md
// One canonical epic-heading grammar in .claude/skills/lib/epic-heading.mjs,
// imported by roadmap/parse.mjs, roadmap-sync/sync.mjs and roadmap-sync/append.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { gatherSync } from '../.claude/skills/standup/gather.mjs';
import { renderEpicSection } from '../.claude/skills/roadmap-sync/append.mjs';
import { Status, parseRoadmap } from '../.claude/skills/roadmap/parse.mjs';

import {
  matchEpicHeadingLine,
  matchEpicHeadingText,
  statusEmojiScanner,
  assertInert,
  STATUS_EMOJI,
  STATUS_BY_EMOJI,
  PLANNED,
  IN_PROGRESS,
  DONE,
} from '../.claude/skills/lib/epic-heading.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARSE = join(REPO_ROOT, '.claude/skills/roadmap/parse.mjs');
const SYNC = join(REPO_ROOT, '.claude/skills/roadmap-sync/sync.mjs');
const APPEND = join(REPO_ROOT, '.claude/skills/roadmap-sync/append.mjs');
const CALL_SITES = [
  ['parse.mjs', PARSE],
  ['sync.mjs', SYNC],
  ['append.mjs', APPEND],
];

const LIVE = '## Epic 9 — Erp portables  🟡  (erp-portables)';

describe('epic-heading grammar — entry points (AC-001, AC-002)', () => {
  it('test_when_line_has_prefix_then_matches_and_without_prefix_returns_null', () => {
    const m = matchEpicHeadingLine(LIVE);
    assert.ok(m, 'a prefixed heading line must match at the line entry point');
    assert.equal(m.num, 9);
    assert.equal(m.rest, 'Erp portables  🟡  (erp-portables)');

    // AC-001 / D4: the prefix is required, so a body line mentioning an epic
    // never counts as a heading. sync.mjs scans every line of the file.
    assert.equal(matchEpicHeadingLine('Epic 9 — Erp portables'), null);
    assert.equal(matchEpicHeadingLine('Epic 3 — mentioned in prose'), null);
  });

  it('test_when_text_lacks_prefix_then_matches_and_with_prefix_returns_null', () => {
    // splitSections() in parse.mjs strips "## " before the grammar ever sees it.
    const m = matchEpicHeadingText('Epic 9 — Erp portables  🟡  (erp-portables)');
    assert.ok(m, 'prefix-stripped heading text must match at the text entry point');
    assert.equal(m.num, 9);
    assert.equal(m.rest, 'Erp portables  🟡  (erp-portables)');

    assert.equal(matchEpicHeadingText(LIVE), null, 'a still-prefixed line is not heading text');
  });

  it('test_when_input_is_not_a_string_then_returns_null_without_throwing', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      assert.equal(matchEpicHeadingLine(bad), null);
      assert.equal(matchEpicHeadingText(bad), null);
    }
  });
});

describe('epic-heading grammar — single declaration (AC-003, AC-004)', () => {
  it('test_when_the_three_call_sites_are_read_then_no_local_epic_heading_regex_remains', () => {
    for (const [name, path] of CALL_SITES) {
      const src = readFileSync(path, 'utf8');
      assert.ok(
        !/^\s*const\s+EPIC_HEADING(_RE)?\s*=/m.test(src),
        `${name} must not declare its own epic-heading regex`,
      );
      assert.ok(
        /from '.*epic-heading\.mjs'/.test(src),
        `${name} must import the canonical grammar`,
      );
    }
  });

  it('test_when_the_three_call_sites_are_read_then_no_local_status_emoji_literal_remains', () => {
    // AC-004 pins LITERALS, not constants. parse.mjs still maps emoji to its own
    // Status enum — that mapping is its public contract, not duplicated vocabulary.
    // What must not survive is a second place declaring which characters are legal.
    for (const [name, path] of CALL_SITES) {
      const src = readFileSync(path, 'utf8');
      const body = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      for (const emoji of ['⬜', '🟡', '✅']) {
        assert.ok(
          !body.includes(emoji),
          `${name} must take ${emoji} from the canonical module, not declare it`,
        );
      }
      assert.ok(
        /from '.*epic-heading\.mjs'/.test(src),
        `${name} must import the emoji vocabulary`,
      );
    }
  });

  it('test_when_vocabulary_read_then_exactly_three_statuses_are_declared', () => {
    assert.deepEqual([PLANNED, IN_PROGRESS, DONE], ['⬜', '🟡', '✅']);
    assert.equal(STATUS_BY_EMOJI.length, 3, 'the vocabulary moves; it does not grow (D3)');
  });
});

describe('epic-heading grammar — assertInert at the canonical site (AC-005, AC-006)', () => {
  const FORGERIES = [
    ['newline forging a second heading', 'X\n\n## Epic 99 — Injected  ✅  (pwned)\n'],
    ['done emoji forging a shipped status', 'Ship ✅ now'],
    ['in-progress emoji', 'Ship 🟡 now'],
    ['planned emoji', 'Ship ⬜ now'],
  ];

  for (const [label, value] of FORGERIES) {
    it(`test_when_title_forges_grammar_then_assert_inert_throws_from_the_canonical_module — ${label}`, () => {
      assert.throws(() => assertInert(value, 'epic title'), /epic title/);
    });
  }

  it('test_when_append_mjs_is_read_then_assert_inert_is_no_longer_declared_there', () => {
    const src = readFileSync(APPEND, 'utf8');
    assert.ok(!/function\s+assertInert\s*\(/.test(src), 'assertInert moved to the canonical module (D2)');
    assert.ok(/assertInert/.test(src), 'append.mjs still calls the imported guard');
  });

  it('test_when_assert_inert_called_twice_with_same_forgery_then_throws_both_times', () => {
    // D6: if STATUS_EMOJI were global, .test() would advance lastIndex and the
    // SECOND call would return false, silently accepting a forged title.
    const forged = 'Ship ✅ now';
    assert.throws(() => assertInert(forged, 'epic title'), /status emoji/);
    assert.throws(() => assertInert(forged, 'epic title'), /status emoji/);
    assert.throws(() => assertInert(forged, 'epic title'), /status emoji/);
  });

  it('test_when_value_is_inert_then_assert_inert_returns_quietly', () => {
    assert.doesNotThrow(() => assertInert('Erp portables', 'epic title'));
    assert.doesNotThrow(() => assertInert('', 'epic title'));
  });
});

describe('epic-heading grammar — scanner statefulness (AC-007)', () => {
  it('test_when_status_emoji_scanner_called_twice_then_returns_distinct_zeroed_regexes', () => {
    const a = statusEmojiScanner();
    const b = statusEmojiScanner();
    assert.notEqual(a, b, 'each call must yield a fresh regex, never a shared one');
    assert.equal(a.lastIndex, 0);
    assert.equal(b.lastIndex, 0);
    assert.ok(a.global, 'the scanner is global — it is used with match/replace');

    a.exec('a ✅ b');
    assert.notEqual(a.lastIndex, 0, 'the fresh copy carries its own state');
    assert.equal(statusEmojiScanner().lastIndex, 0, 'a later call is unaffected');
  });

  it('test_when_shared_status_emoji_read_then_it_is_not_global', () => {
    assert.equal(STATUS_EMOJI.global, false, 'the shared export must be stateless (D6)');
  });
});

// The grammar merge is only safe if the live plan parses to the same figures it
// did before. These are the values standup-roadmap-parity.test.mjs pins from the
// recap side; asserting them here pins them at the parser itself, so a regression
// is attributed to the grammar rather than to the projection above it.
describe('epic-heading grammar — the live plan parses unchanged (AC-009)', () => {
  it('test_when_live_roadmap_parsed_then_epic_and_progress_counts_are_unchanged', () => {
    const plan = parseRoadmap(REPO_ROOT);
    assert.ok(plan, 'the live plan must parse');
    assert.equal(plan.epics.length, 17);
    assert.equal(plan.progress.length, 8);
    assert.deepEqual(
      plan.epics.find((e) => e.num === 6).tally,
      { done: 11, inProgress: 0, planned: 0 },
    );
  });
});

// --- AC-014: the summary is guarded too (security follow-up, CWE-74) --------

// `title` and `tag` are interpolated into the MIDDLE of the heading line, so a
// `## ` they carry can never reach a line start. `summary` is pushed as a line
// of its own, which makes it the one field that can forge a heading outright.
// assertInert alone is therefore insufficient for it: a heading needs neither a
// newline nor a status emoji.
describe('epic-heading grammar — the summary cannot forge structure (AC-014)', () => {
  const base = { num: 3, title: 'Alpha', tag: 'alpha', slices: [] };

  it('test_when_summary_forges_a_heading_without_newline_or_emoji_then_render_throws', () => {
    assert.throws(
      () => renderEpicSection({ ...base, summary: '## Epic 99 — Injected (pwned)' }),
      /epic summary must not be an epic heading/,
      'assertInert would pass this: no newline, no status emoji',
    );
  });

  it('test_when_summary_carries_a_newline_or_a_status_emoji_then_render_throws', () => {
    for (const forged of [
      'x\n\n## Epic 99 — Injected  ✅  (pwned)\n',
      'x\n- ✅ T1. Forged row.\n',
      'Shipped ✅ already',
    ]) {
      assert.throws(() => renderEpicSection({ ...base, summary: forged }), /epic summary/);
    }
  });

  it('test_when_summary_is_ordinary_prose_then_it_renders_verbatim', () => {
    const section = renderEpicSection({ ...base, summary: 'Three separable slices.' });
    assert.match(section, /^Three separable slices\.$/m);
  });

  it('test_when_summary_is_absent_or_empty_then_render_is_unchanged', () => {
    const withNone = renderEpicSection(base);
    for (const empty of [undefined, null, '']) {
      assert.equal(renderEpicSection({ ...base, summary: empty }), withNone);
    }
  });
});

// --- AC-012 / AC-013: one status vocabulary, no translation shim ------------

// parse.mjs used to spell the in-flight state `in_progress` while roadmap-sync
// and the standup recap spelled it `in-progress`, so standup/gather.mjs carried
// a recapStatus() function to translate between them. Both sites now read the
// hyphenated spelling the shared grammar implies, so the shim is deleted.
describe('epic-heading grammar — one status vocabulary (AC-012, AC-013)', () => {
  const GATHER = join(REPO_ROOT, '.claude/skills/standup/gather.mjs');

  it('test_when_gather_source_read_then_no_status_translation_remains', () => {
    const src = readFileSync(GATHER, 'utf8');
    assert.ok(!/function\s+recapStatus\b/.test(src), 'the translation function must be deleted');
    assert.ok(!/recapStatus\s*\(/.test(src), 'no call site may survive the deletion');
    assert.ok(!src.includes('in_progress'), 'the underscore spelling must not survive anywhere');
  });

  it('test_when_recap_gathered_on_in_flight_epic_then_status_is_hyphenated_without_a_shim', () => {
    assert.equal(Status.IN_PROGRESS, 'in-progress', 'the enum itself carries the hyphenated form');

    const root = mkdtempSync(join(tmpdir(), 'epic-vocab-'));
    try {
      mkdirSync(join(root, 'docs'), { recursive: true });
      writeFileSync(
        join(root, 'docs/roadmap-execution-plan.md'),
        [
          '## Epic 1 — Alpha  🟡  (alpha)',
          '',
          '- ✅ T1. Done one.',
          '- 🟡 T2. Doing two.',
          '- ⬜ T3. Planned three.',
          '',
        ].join('\n'),
        'utf8',
      );

      const recap = gatherSync({ rootDir: root });
      const epic = recap.roadmap.epics[0];
      assert.equal(epic.status, 'in-progress', 'the heading status reaches the recap verbatim');
      assert.equal(epic.status, Status.IN_PROGRESS, 'and it is the enum value, not a translation of it');

      const doing = epic.openTasks.find((t) => t.id === 'T2');
      assert.ok(doing, 'the in-flight row is open, so it reaches openTasks');
      assert.equal(doing.status, Status.IN_PROGRESS, 'row status shares the one vocabulary');
      assert.deepEqual(epic.tasks, { done: 1, inProgress: 1, planned: 1 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// --- AC-008 / AC-011: the edge deltas, and the completeness of that list -----

// The three ORIGINAL regexes, re-declared here as the historical oracle. This is
// deliberate duplication: the test's job is to compare before against after, so
// it must hold "before" itself rather than import it from code that no longer
// declares it.
const P_OLD = /^Epic\s+(\d+)\s+—\s+(.+)$/; // parse.mjs, on prefix-stripped text
const S_OLD = /^## Epic (\d+) —/; // sync.mjs, on raw lines, num only, unanchored
const A_OLD = /^## Epic (\d+) — (.*)$/; // append.mjs, on raw lines

const CORPUS = [
  '## Epic 9 — Erp portables  🟡  (erp-portables)',
  '## Epic 5 — Foo',
  '## Epic 5 —',
  '## Epic 5 — ',
  '## Epic 5 —Title',
  '##  Epic  5  —  Title',
  '## Epic 5 —  Title',
  '### Epic 5 — Foo',
  '  ## Epic 5 — Foo',
  'Epic 3 — mentioned in prose',
  '## Epic five — Foo',
  '## Epic 05 — Foo',
  '## Epic 5 - Foo',
  '## Epic 5 — Foo   ',
  '## Progress — notes',
  '## Epic 12 — System spec delta  ✅  (system-spec-delta)',
];

// Exactly the deltas §Behavior #4 declares, keyed by "site\u0000input".
const DECLARED_DELTAS = new Set([
  'sync.mjs\u0000## Epic 5 —', // E1
  'sync.mjs\u0000## Epic 5 — ', // E1
  'append.mjs\u0000## Epic 5 — ', // E1
  'sync.mjs\u0000## Epic 5 —Title', // E3
  'sync.mjs\u0000##  Epic  5  —  Title', // E2
  'append.mjs\u0000##  Epic  5  —  Title', // E2
  'append.mjs\u0000## Epic 5 —  Title', // E4
]);

function observedDeltas() {
  const found = [];
  for (const line of CORPUS) {
    const s = S_OLD.exec(line);
    const a = A_OLD.exec(line);
    const n = matchEpicHeadingLine(line);

    if (!!s !== !!n) found.push({ site: 'sync.mjs', line });
    if (!!a !== !!n || (a && n && a[2] !== n.rest)) found.push({ site: 'append.mjs', line });

    const stripped = line.split(/^##\s+/m)[1];
    if (stripped !== undefined) {
      const heading = stripped.split('\n', 1)[0].trim();
      const p = P_OLD.exec(heading);
      const t = matchEpicHeadingText(heading);
      if (!!p !== !!t || (p && t && (Number(p[1]) !== t.num || p[2] !== t.rest))) {
        found.push({ site: 'parse.mjs', line });
      }
    }
  }
  return found;
}

describe('epic-heading grammar — declared edge deltas (AC-008)', () => {
  it('test_when_edge_heading_e1_through_e4_then_every_site_agrees', () => {
    // E1 — no title: nothing matches anywhere.
    assert.equal(matchEpicHeadingLine('## Epic 5 —'), null);
    assert.equal(matchEpicHeadingLine('## Epic 5 — '), null);

    // E2 — irregular whitespace: now matches at the line entry point too.
    const e2 = matchEpicHeadingLine('##  Epic  5  —  Title');
    assert.ok(e2);
    assert.equal(e2.num, 5);
    assert.equal(e2.rest, 'Title');

    // E3 — no space after the dash: no longer a heading.
    assert.equal(matchEpicHeadingLine('## Epic 5 —Title'), null);

    // E4 — two spaces after the dash: the captured rest is normalized.
    const e4 = matchEpicHeadingLine('## Epic 5 —  Title');
    assert.ok(e4);
    assert.equal(e4.rest, 'Title', 'greedy \\s+ absorbs the second space');
    assert.equal(A_OLD.exec('## Epic 5 —  Title')[2], ' Title', 'the old capture kept it');
  });

  it('test_when_parse_mjs_position_is_compared_then_it_has_no_delta_at_all', () => {
    assert.deepEqual(
      observedDeltas().filter((d) => d.site === 'parse.mjs'),
      [],
      'the text entry point is byte-identical to the original parse.mjs regex',
    );
  });
});

describe('epic-heading grammar — completeness of the delta table (AC-011)', () => {
  it('test_when_old_and_new_grammars_run_differentially_then_only_declared_deltas_appear', () => {
    const observed = new Set(observedDeltas().map((d) => `${d.site}\u0000${d.line}`));

    const undeclared = [...observed].filter((k) => !DECLARED_DELTAS.has(k));
    assert.deepEqual(
      undeclared.map((k) => k.split('\u0000')),
      [],
      'a divergence the spec does not declare — §Behavior #4 is incomplete',
    );

    const missing = [...DECLARED_DELTAS].filter((k) => !observed.has(k));
    assert.deepEqual(
      missing.map((k) => k.split('\u0000')),
      [],
      'the spec declares a delta that no longer occurs — §Behavior #4 is stale',
    );
  });

  it('test_when_live_roadmap_headings_are_checked_then_none_hit_an_edge_case', () => {
    const roadmap = readFileSync(join(REPO_ROOT, 'docs/roadmap-execution-plan.md'), 'utf8');
    const headings = roadmap.split('\n').filter((l) => l.startsWith('## Epic'));
    assert.ok(headings.length >= 12, 'the live plan carries at least 12 epic headings');
    for (const h of headings) {
      assert.ok(matchEpicHeadingLine(h), `live heading must parse: ${h}`);
      assert.ok(!DECLARED_DELTAS.has(`sync.mjs\u0000${h}`), `live heading hits an edge case: ${h}`);
      assert.ok(!DECLARED_DELTAS.has(`append.mjs\u0000${h}`), `live heading hits an edge case: ${h}`);
    }
  });
});
