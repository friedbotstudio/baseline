// An entry whose key contains whitespace must be addressable by every sweep mode.
//
// It was not. `splitEntries` took the FIRST whitespace-delimited token of a heading
// as the entry's key — `const key = trimmed.split(/\s+/)[0]`. A slug key is one
// token, so the store looked fine; four live backlog entries carry sentence keys and
// every one of them registered under a fragment. `findEntryBlock` compares for exact
// equality, so nothing could reach them: not `stamp-closure`, not `auto-close`, not
// the stale sweep.
//
// Measured 2026-08-20 during the `changedfiles-shape-contract` landing. That
// workflow's `source_backlog_keys` named `1. \`ctx.changedFiles\` has two readers
// that disagree on its shape`; stamp-closure reported it `missing` while the heading
// sat verbatim in the flattened text, and `git_commit_guard` then hard-blocked the
// closing commit. The obligation was unsatisfiable, not unsatisfied.
//
// The rest of the family already keys on the full heading: `blockToFact` takes
// `lines[headingIdx].replace(/^##\s+/, '').trim()`, and `splitFlatIntoRecords`
// matches whole heading text against the frontmatter keys in `keyToFile`. Only
// `splitEntries` disagreed, so this pins it to its own siblings.
//
// Driven through `runSweep`, the exported entry point, rather than the internal
// splitter — the defect is only worth fixing where a caller can reach it.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  tryImport,
  makeProject,
  writeShard,
  writeFlatCategory,
  additionalContextOf,
} from './helpers/memory-fixtures.mjs';

const SWEEP_REL = '.claude/skills/memory-sync/sweep.mjs';
const HOOK_REL = '.claude/hooks/lib/memory_session_start.mjs';

// Shaped like the live entry that exposed this: a leading ordinal, a backticked
// symbol, and prose. The first token is `1.`, which is what the old key resolution
// returned and what made the entry unaddressable.
const SENTENCE_KEY = '1. `ctx.changedFiles` has two readers that disagree on its shape';
const SLUG_KEY = 'an-ordinary-slug-key-4b17';

let sweep;
let hook;

before(async () => {
  sweep = await tryImport(SWEEP_REL);
  hook = await tryImport(HOOK_REL);
  assert.ok(sweep, `${SWEEP_REL} must import cleanly`);
  assert.ok(hook, `${HOOK_REL} must import cleanly`);
});

function seedStore() {
  const { root, memDir } = makeProject();
  for (const key of [SENTENCE_KEY, SLUG_KEY]) {
    writeShard(memDir, 'backlog', key, {
      key,
      fields: {
        scope: '[]',
        status: 'open',
        governs: '.claude/**',
        'verified-at': 'abc1234',
        'last-touched': '2026-08-20',
      },
      body: '- Why it is open. One line is enough to prove the block round-tripped.',
    });
  }
  return { root, memDir };
}

function shardCarrying(memDir, key) {
  const dir = join(memDir, 'backlog');
  for (const file of readdirSync(dir)) {
    const text = readFileSync(join(dir, file), 'utf8');
    for (const line of text.split('\n')) {
      if (line.startsWith('key: ') && line.slice(5).trim() === key) return text;
    }
  }
  return null;
}

function stampClosure(root, memDir, key) {
  return sweep.runSweep({ mode: 'stamp-closure', rootDir: root, memoryDir: memDir, backlogKeys: key });
}

describe('sweep addresses an entry whose key contains whitespace', () => {
  it('test_when_key_has_whitespace_then_stamp_closure_reaches_it', () => {
    const { root, memDir } = seedStore();

    const report = stampClosure(root, memDir, SENTENCE_KEY);

    assert.equal(report.stamped, 1,
      'the closure obligation named this key; reporting it `missing` left the obligation '
      + 'unsatisfiable and hard-blocked the closing commit');
    assert.deepEqual(report.missing, [], 'the entry is present — it was only unaddressable');

    const stamped = shardCarrying(memDir, SENTENCE_KEY);
    assert.match(stamped, /^status: picked-up$/m, 'status is stamped in the shard frontmatter');
    assert.match(stamped, /^superseded-at: \d{4}-\d{2}-\d{2}$/m, 'superseded-at carries a real date');
  });

  it('test_when_key_is_a_single_token_then_it_is_still_reachable', () => {
    const { root, memDir } = seedStore();

    const report = stampClosure(root, memDir, SLUG_KEY);

    assert.equal(report.stamped, 1,
      'a single-token heading was always reachable; this fix must be a no-op for every slug key');
    assert.match(shardCarrying(memDir, SLUG_KEY), /^status: picked-up$/m);
  });

  it('test_when_one_key_is_stamped_then_the_sibling_shard_is_untouched', () => {
    const { root, memDir } = seedStore();
    const before = shardCarrying(memDir, SLUG_KEY);

    stampClosure(root, memDir, SENTENCE_KEY);

    assert.equal(shardCarrying(memDir, SLUG_KEY), before,
      'the write path rewrites the whole category, so a key-resolution change must not '
      + 'relocate or rewrite any sibling — writeShardedFromFlat deletes every shard it '
      + 'does not re-emit');
  });

  it('test_when_key_is_only_a_leading_fragment_then_nothing_is_stamped', () => {
    const { root, memDir } = seedStore();

    const report = stampClosure(root, memDir, '1.');

    assert.equal(report.stamped, 0,
      'the first token must no longer address the entry — resolving `1.` to a sentence-keyed '
      + 'entry is the defect, not the fix');
    assert.deepEqual(report.missing, ['1.'], 'the fragment is reported missing, by its own name');
  });
});

// The same defect, in the reader on the other side of the store.
//
// `splitBlocks` in the session-start index builder still takes the first
// whitespace-delimited token of a heading — `m[1].trim().split(/\s+/)[0]` — which is
// the form `splitEntries` was repaired out of above. The two readers therefore
// disagree about what a flat entry is called.
//
// State the blast radius exactly, because it is narrower than the sweep's and the
// original report overstated it. The entry COUNT comes from the number of headings
// and is right either way; `test_when_split_blocks_changes_then_the_flat_entry_count_
// is_unchanged` is what pins that, and it is what makes this fix additive for a
// consumer install rather than a change to any reported number. What truncates is
// the LABEL, and the label is what the index prints in its `## Stale entries` list.
// A curator who copies that label back to address the entry finds nothing, because
// `findEntryBlock` compares for exact equality.
//
// Driven through `buildIndex`, the exported entry point, for the reason recorded at
// the top of this file: the defect is only worth fixing where a caller can reach it.
// `splitBlocks` stays private.
//
// Sharded stores are unaffected — `readShardedCategory` reads `fm.key` and always
// carried the whole key. Flat is the shape a fresh consumer install starts on.

// `constraints` is the category under test because it decays by age: it sits in
// neither STALE_EXEMPT nor SUPERSESSION_DRIVEN, so an aged entry reliably reaches
// the stale list where its label can be read. A `backlog` fixture would be exempt
// and every assertion below would pass vacuously.
const AGED_ENTRY_FIELDS = ['- verified-at: HEAD', '- last-touched: 2020-01-01'];

const FLAT_SENTENCE_KEY = 'a wide governs glob ripples into unrelated literals';
const FLAT_COLLIDING_KEY = 'a wide governs glob is honest for suite-wide advice';

function indexOverFlatConstraints(keys) {
  const { root, memDir } = makeProject();
  writeFlatCategory(memDir, 'constraints', keys.map((key) => ({ key, bodyLines: AGED_ENTRY_FIELDS })));
  return additionalContextOf(hook.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' }));
}

function staleLabelsIn(index) {
  return [...index.matchAll(/^- `constraints\.md` `(.+?)`/gm)].map((m) => m[1]);
}

function reportedEntryCount(index) {
  const row = /^\|\s*`constraints\.md`\s*\|\s*(\d+)\s*\|/m.exec(index);
  return row ? Number(row[1]) : null;
}

describe('session-start names a flat entry whose key contains whitespace', () => {
  it('test_when_a_flat_heading_has_several_words_then_split_blocks_keys_on_the_whole_heading', () => {
    const index = indexOverFlatConstraints([FLAT_SENTENCE_KEY]);

    assert.deepEqual(
      staleLabelsIn(index), [FLAT_SENTENCE_KEY],
      'the index must name the entry by its whole heading; the first token `a` addresses nothing, '
      + 'and findEntryBlock compares for exact equality',
    );
  });

  it('test_when_two_flat_headings_share_a_first_word_then_their_keys_stay_distinct', () => {
    const index = indexOverFlatConstraints([FLAT_SENTENCE_KEY, FLAT_COLLIDING_KEY]);

    assert.deepEqual(
      staleLabelsIn(index).sort(), [FLAT_COLLIDING_KEY, FLAT_SENTENCE_KEY].sort(),
      'both headings begin with `a`, so first-token keying collapsed them to one indistinguishable '
      + 'label while the store held two separate entries',
    );
  });

  it('test_when_split_blocks_changes_then_the_flat_entry_count_is_unchanged', () => {
    // The literal comes from the fixture's own heading list, never from the splitter
    // under test — otherwise this asserts that the code agrees with itself.
    const keys = [
      FLAT_SENTENCE_KEY,
      FLAT_COLLIDING_KEY,
      'a third heading sharing the same first word',
      'an-ordinary-slug-key-9c02',
      'another sentence key entirely',
    ];

    assert.equal(
      reportedEntryCount(indexOverFlatConstraints(keys)), keys.length,
      'the count comes from the number of headings and must not move: this repair changes labels '
      + 'only, which is what makes it additive for a consumer install still on the flat shape',
    );
  });
});
