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

import { tryImport, makeProject, writeShard } from './helpers/memory-fixtures.mjs';

const SWEEP_REL = '.claude/skills/memory-sync/sweep.mjs';

// Shaped like the live entry that exposed this: a leading ordinal, a backticked
// symbol, and prose. The first token is `1.`, which is what the old key resolution
// returned and what made the entry unaddressable.
const SENTENCE_KEY = '1. `ctx.changedFiles` has two readers that disagree on its shape';
const SLUG_KEY = 'an-ordinary-slug-key-4b17';

let sweep;

before(async () => {
  sweep = await tryImport(SWEEP_REL);
  assert.ok(sweep, `${SWEEP_REL} must import cleanly`);
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
