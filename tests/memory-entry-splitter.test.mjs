// One definition of how a flat memory file splits into entries.
//
// There were four, and they drifted twice.
//
// Key derivation: `sweep.splitEntries` and `shape.blockToFact` take the whole
// heading; `memory_session_start.splitBlocks` takes the first whitespace-delimited
// token. The same entry is `a wide governs glob ripples into unrelated literals` to
// one reader and `a` to the other.
//
// The sub-heading guard: `shape.splitFlatIntoRecords` opens a record only at a `## `
// line naming a key it found on disk, because an entry body may carry its own `## `
// sub-heading. shape.mjs records what the naive version cost, measured 2026-08-14 on
// the live store — 4 spurious shards minted, 2 parents stripped of scope, governs,
// load_bearing, verified-at and last-touched. `splitEntries` and `splitBlocks` never
// got that guard and still split naively.
//
// Two live entries carry four sub-headings between them today:
// `landmines/grep-reports-no-match-on-utf8-files-it-calls-binary` (3) and
// `landmines/drift-check-resolves-acs-by-literal-mention-not-implementation` (1).
// Re-measure with:
//   awk 'BEGIN{fm=0} /^---$/{fm++; next} fm>=2 && /^## /{c++} END{print c+0}' <file>
//
// THE CONTRACT THAT PROTECTS THE WRITE PATH. Every returned block must be a
// byte-exact substring of the body it came from. `replaceBlock` and `deleteBlock`
// locate a block with `text.indexOf(block)` and RETURN THE TEXT UNCHANGED when it is
// not found (sweep.mjs:174-193). A normalized block does not throw — memory-sync's
// writes just silently stop happening. `splitBlocks` rebuilds blocks line-by-line as
// `ln + '\n'`, which normalizes CRLF and forces a trailing newline, so it is the
// implementation that has to move, never the contract.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, tryImport, makeProject, writeShard } from './helpers/memory-fixtures.mjs';

const SPLITTER_REL = '.claude/hooks/lib/memory-entries.mjs';

const READERS_THAT_MUST_NOT_KEEP_A_COPY = [
  '.claude/skills/memory-sync/sweep.mjs',
  '.claude/hooks/lib/memory_session_start.mjs',
  '.claude/skills/memory-sync/shape.mjs',
];

const PARENT_KEY = 'grep reports no match on utf8 files it calls binary';
const SIBLING_KEY = 'an ordinary sibling entry';

// Shaped like the live landmine: fields, prose, then a dated `## ` sub-section that
// belongs to this entry and is not a new one.
const BODY_WITH_SUB_HEADING = [
  `## ${PARENT_KEY}`,
  '',
  '- verified-at: abc1234',
  '- last-touched: 2026-08-27',
  '- Always pass `-a` when grepping repo sources.',
  '',
  '## 2026-08-05 — a second, worse cause: a real control byte',
  '',
  '- A raw NUL produces the same invisibility with a harder edge.',
  '',
  `## ${SIBLING_KEY}`,
  '',
  '- verified-at: abc1234',
  '',
].join('\n');

let splitter;

// Scoped to the describe that needs the module. A file-level `before` cancels every
// test in the file when it throws, and a cancelled test reports red while having
// evaluated nothing — the source-reading assertions below would then be measuring
// the absence of the module rather than what they claim to measure.
describe('memory entry splitter — one definition, and it is byte-exact', () => {
  before(async () => {
    splitter = await tryImport(SPLITTER_REL);
    assert.ok(splitter, `${SPLITTER_REL} must import cleanly — it is the single definition all four readers share`);
    for (const name of ['stripFrontmatter', 'entryKeyFromHeading', 'splitFlatEntries']) {
      assert.equal(typeof splitter[name], 'function', `${SPLITTER_REL} must export ${name}`);
    }
  });

  it('test_when_a_heading_has_several_words_then_the_key_is_the_whole_heading', () => {
    assert.equal(splitter.entryKeyFromHeading('## a wide governs glob ripples'), 'a wide governs glob ripples');
    assert.equal(
      splitter.entryKeyFromHeading('##   padded   heading  '), 'padded   heading',
      'the outer padding goes; interior spacing is part of the key and must survive verbatim',
    );
  });

  it('test_when_blocks_are_returned_then_each_is_a_byte_exact_substring_of_the_body', () => {
    const entries = splitter.splitFlatEntries(BODY_WITH_SUB_HEADING);

    assert.ok(entries.length > 0, 'an empty result would make every assertion below vacuous');
    for (const [key, block] of entries) {
      assert.ok(
        BODY_WITH_SUB_HEADING.includes(block),
        `block for \`${key}\` is not a substring of its source; replaceBlock would find nothing and `
        + 'silently no-op, which is how memory-sync stops writing without reporting anything',
      );
    }
  });

  it('test_when_no_known_keys_are_given_then_every_heading_opens_an_entry', () => {
    // The flat-store fallback. A flat store's entries ARE its headings, so there is no
    // independent authority to check against and the positional split is the honest answer.
    const keys = splitter.splitFlatEntries(BODY_WITH_SUB_HEADING).map(([k]) => k);

    assert.deepEqual(
      keys,
      [PARENT_KEY, '2026-08-05 — a second, worse cause: a real control byte', SIBLING_KEY],
      'without a key list the splitter must behave exactly as it does today',
    );
  });

  it('test_when_a_body_sub_heading_is_not_a_known_key_then_it_stays_with_its_parent', () => {
    const entries = splitter.splitFlatEntries(BODY_WITH_SUB_HEADING, { knownKeys: [PARENT_KEY, SIBLING_KEY] });

    assert.deepEqual(
      entries.map(([k]) => k), [PARENT_KEY, SIBLING_KEY],
      'the dated sub-section belongs to its parent; minting it as an entry is what stripped two live '
      + 'parents of every field on 2026-08-14',
    );
    const [, parentBlock] = entries[0];
    assert.ok(
      parentBlock.includes('a real control byte'),
      'the parent must keep the text below its sub-heading — the split dropped it, which is the '
      + 'expensive half of this defect',
    );
    assert.ok(
      parentBlock.includes('- last-touched: 2026-08-27'),
      'and it must keep the fields above it, or the entry reads as never-verified',
    );
  });

  it('test_when_frontmatter_closes_after_a_body_rule_then_only_the_frontmatter_is_stripped', () => {
    const text = ['---', 'owners: [test]', '---', '', '## an entry', '', 'Prose, then a rule.', '', '---', '', 'More prose.', ''].join('\n');

    const body = splitter.stripFrontmatter(text);

    assert.ok(!body.includes('owners: [test]'), 'the frontmatter goes');
    assert.ok(
      body.includes('More prose.'),
      'a `---` horizontal rule in the body is not the frontmatter close; a substring search for it '
      + 'truncates the file silently',
    );
  });
});

// The surfacing path signal — spec D3/D5 of stale-keying-and-glob-scope.
//
// `governs:` decided both when an entry re-verifies and where it surfaces, and the
// two want opposite widths. `surfaces-on:` takes the surfacing half; `governs:` keeps
// the staleness half (D6). Both surfacing mechanisms resolve through this ONE helper
// (D5), because two sites applying the precedence independently is the drift this
// whole change exists to close.
//
// Precedence (D3): surfaces-on -> governs -> path-shaped key. First non-empty wins.
// The key fallback stays LAST and untouched — scoped-memory.mjs:36-37 records that
// only 8 of 92 category-default landmarks declare `governs:`, so the other 84 are
// filterable through that fallback alone.

const SURFACING_KEY = 'surfaces-on';

function entryWithFields(fields, key = 'an-ordinary-slug-key') {
  return { key, category: 'landmines', fields };
}

// Each test resolves the export itself rather than sharing a describe-level before().
// A hook that throws CANCELS every sibling, and node:test prints a cancelled test as
// red having evaluated nothing — so an unrelated precondition failure is indistinguishable
// from the assertion failing. That bit this file once already.
async function loadSurfacingSignal() {
  const mod = await tryImport(SPLITTER_REL);
  assert.ok(mod, `${SPLITTER_REL} must import cleanly`);
  assert.equal(
    typeof mod.surfacingPathsOf, 'function',
    `${SPLITTER_REL} must export surfacingPathsOf — D5 puts one definition behind both mechanisms`,
  );
  return mod;
}

describe('surfacing path signal — precedence and back-compat (AC-004)', () => {

  // The highest-risk test in this set. "Unchanged" is exactly the assertion that
  // passes while measuring nothing, which is why every row names the concrete array
  // it expects rather than asserting no error was thrown. See the landmines
  // `a-check-that-measured-nothing-reports-success` and
  // `a-checker-aimed-one-axis-off-passes-loudly`.
  it('test_when_an_entry_declares_no_surfacing_scope_then_staleness_and_both_mechanisms_are_unchanged', async () => {
    const signal = await loadSurfacingSignal();
    const cases = [
      {
        what: 'governs only — the shape almost every declaring entry has today',
        entry: entryWithFields({ governs: ['.claude/hooks/**', 'src/**'] }),
        expected: ['.claude/hooks/**', 'src/**'],
      },
      {
        what: 'no governs, path-shaped key — the 84 category-default landmarks',
        entry: entryWithFields({}, '.claude/hooks/lib/common.mjs:1'),
        expected: ['.claude/hooks/lib/common.mjs'],
      },
      {
        what: 'no governs, no path-shaped key — a prose-keyed convention',
        entry: entryWithFields({}, 'a red pre-existing test may be a contract conflict'),
        expected: [],
      },
      {
        what: 'an empty surfaces-on must not shadow a populated governs',
        entry: entryWithFields({ [SURFACING_KEY]: [], governs: ['tests/**'] }),
        expected: ['tests/**'],
      },
    ];

    const wrong = cases
      .map((c) => ({ ...c, actual: signal.surfacingPathsOf(c.entry) }))
      .filter((c) => JSON.stringify(c.actual) !== JSON.stringify(c.expected))
      .map((c) => `${c.what}: got ${JSON.stringify(c.actual)}, want ${JSON.stringify(c.expected)}`);

    assert.deepEqual(
      wrong, [],
      'an entry adopting nothing must resolve exactly as it did before the split — this is the whole '
      + 'additive claim, and a consumer install is the thing it protects',
    );
  });

  // The companion guard. Every row above carries ONE signal, so all of them still
  // pass with the precedence inverted. This is the row that cannot.
  it('test_when_surfaces_on_and_governs_differ_then_the_surfacing_signal_returns_surfaces_on', async () => {
    const signal = await loadSurfacingSignal();
    const entry = entryWithFields({
      [SURFACING_KEY]: ['.claude/**', 'src/**', 'tests/**', 'docs/**'],
      governs: ['tests/control-bytes.test.mjs'],
    });

    assert.deepEqual(
      signal.surfacingPathsOf(entry), ['.claude/**', 'src/**', 'tests/**', 'docs/**'],
      'surfaces-on outranks governs (D3). This is the shape the four in-scope entries take — narrow for '
      + 'staleness, wide for surfacing — so an inverted precedence silently re-creates the defect',
    );
  });

  it('test_when_a_shard_carries_the_surfacing_field_then_assert_relifted_does_not_refuse', async () => {
    const sweep = await tryImport('.claude/skills/memory-sync/sweep.mjs');
    assert.ok(sweep, 'sweep.mjs must import cleanly');

    const { memDir } = makeProject();
    writeShard(memDir, 'landmines', 'declares-surfacing-in-frontmatter', {
      key: 'declares-surfacing-in-frontmatter',
      fields: { [SURFACING_KEY]: '.claude/**', governs: 'tests/control-bytes.test.mjs', 'verified-at': 'abc1234' },
      bodyLines: ['A landmine whose audience is wider than its evidence.'],
    });
    writeShard(memDir, 'landmines', 'declares-surfacing-in-body', {
      key: 'declares-surfacing-in-body',
      fields: { 'verified-at': 'abc1234' },
      bodyLines: ['Prose first.', '', `- ${SURFACING_KEY}: .claude/**`],
    });

    // AC-007 of docs/specs/stale-keying-and-glob-scope.md.
    //
    // D2: the field is deliberately NOT in LIFTABLE_FIELDS, matching `governs:`.
    // Were it liftable, the stray body bullet above would make strandedFieldBullets
    // non-empty and assertRelifted would refuse EVERY sweep mode — a new hard failure
    // for a field whose entire contract is that absence is inert.
    assert.doesNotThrow(
      () => sweep.assertRelifted(memDir),
      'a shard carrying the surfacing field, in frontmatter or as a stray body bullet, must never '
      + 'block a sweep',
    );
  });
});

describe('memory entry splitter — no reader keeps its own copy', () => {
  // Same shape as `test_when_sweep_source_is_read_then_the_category_sets_are_imported_not_redeclared`
  // in sweep-staleness-parity.test.mjs. A second copy of a rule drifts, and then the
  // check comparing the two copies compares two wrongs. This is the assertion that
  // makes the extraction drift-proof rather than merely DRY.
  for (const rel of READERS_THAT_MUST_NOT_KEEP_A_COPY) {
    it(`test_when_${rel.replace(/[^\w]/g, '_')}_is_read_then_it_imports_the_shared_splitter`, () => {
      const source = readFileSync(join(REPO_ROOT, rel), 'utf8');

      assert.match(
        source, /import\s*\{[^}]*\bsplitFlatEntries\b[^}]*\}\s*from\s*'[^']*memory-entries\.mjs'/,
        `${rel} must take the splitter from the module that owns it`,
      );
      assert.doesNotMatch(
        source, /^\s*function\s+(splitEntries|splitBlocks|splitFlatIntoRecords)\s*\(/m,
        `${rel} must not declare its own entry splitter — that is the duplication this module removes`,
      );
      assert.doesNotMatch(
        source, /\.split\(\/\\s\+\/\)\[0\]/,
        `${rel} must not derive a key from the first whitespace-delimited token — that is the drift itself`,
      );
    });
  }
});
