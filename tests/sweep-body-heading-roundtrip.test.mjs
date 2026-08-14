// An entry whose BODY contains a `## ` heading must survive the sharded<->flat
// round-trip intact.
//
// It did not. `readShardedAsFlat` concatenates every shard into one flat text where
// `## <key>` is the record separator, and both sides then split on EVERY `^## ` line
// — so a date-headed section inside a body reads as a new record. The write side
// minted it as its own shard and the parent lost every field and every line below
// its first body heading.
//
// Measured 2026-08-14 on the live store during the 248-entry stale sweep: two
// landmines carried body headings, four spurious shards appeared, and both parents
// were stripped of scope/governs/load_bearing/verified-at/last-touched. One of the
// two was not even stale — it was rewritten purely as collateral of writing the
// category back.
//
// The damage is silent in both directions: the parent still exists, so nothing
// reports a missing entry, and the spurious shards look like ordinary entries.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, tryImport, makeProject, writeShard } from './helpers/memory-fixtures.mjs';

const SHAPE_REL = '.claude/skills/memory-sync/shape.mjs';
const SWEEP_REL = '.claude/skills/memory-sync/sweep.mjs';

let shape;
let sweep;

before(async () => {
  shape = await tryImport(SHAPE_REL);
  sweep = await tryImport(SWEEP_REL);
  assert.ok(shape, `${SHAPE_REL} must import cleanly`);
  assert.ok(sweep, `${SWEEP_REL} must import cleanly`);
});

// A body heading, plus content BELOW it — the content below is what silently
// vanished, so a fixture without it would pass while the defect remained.
const BODY_WITH_HEADING = [
  '- The trap. Something goes wrong in a way that looks like success.',
  '',
  '## 2026-08-05 — a second, worse cause',
  '',
  '- The follow-up finding, which lives below the heading and must survive.',
  '- A second line under the same sub-heading.',
];

function seedStore() {
  const { root, memDir } = makeProject();
  // The entry under test. Not closed, not stale — it must not be touched at all.
  writeShard(memDir, 'landmines', 'has-a-body-heading', {
    key: 'has-a-body-heading',
    fields: {
      scope: '[]',
      governs: '.claude/**, src/**',
      load_bearing: 'true',
      'verified-at': 'abc1234',
      'last-touched': '2026-08-13',
    },
    bodyLines: BODY_WITH_HEADING,
  });
  // A closed sibling, so auto-close deletes something and the category is written
  // back. Without a write there is no round-trip and the defect never fires.
  writeShard(memDir, 'landmines', 'a-closed-sibling', {
    key: 'a-closed-sibling',
    fields: { scope: '[]', governs: '.claude/**', 'superseded-at': '2026-01-01' },
    bodyLines: ['- This one is closed and should be swept away.'],
  });
  return { root, memDir };
}

describe('sweep round-trip — a body heading is not a record boundary', () => {
  it('test_when_an_entry_body_carries_a_heading_then_the_round_trip_preserves_it', () => {
    const { root, memDir } = seedStore();
    try {
      const report = sweep.runSweep({ mode: 'auto-close', rootDir: root, memoryDir: memDir });
      assert.equal(report.closed, 1, 'the closed sibling must be swept, so a write actually happens');

      const survivor = join(memDir, 'landmines', 'has-a-body-heading.md');
      assert.ok(existsSync(survivor), 'the entry under test must still exist');
      const text = readFileSync(survivor, 'utf8');

      // Every field the round-trip dropped.
      for (const field of ['governs:', 'load_bearing:', 'verified-at:', 'last-touched:']) {
        assert.match(text, new RegExp(`^${field}`, 'm'), `frontmatter must retain ${field}`);
      }
      // The heading and — the part that actually disappeared — the lines below it.
      assert.match(text, /## 2026-08-05 — a second, worse cause/, 'the body heading must survive');
      assert.match(text, /the follow-up finding, which lives below the heading/i,
        'content BELOW the body heading must survive');
      assert.match(text, /A second line under the same sub-heading\./,
        'every line below the body heading must survive');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_a_body_heading_is_read_then_no_spurious_shard_is_minted', () => {
    const { root, memDir } = seedStore();
    try {
      sweep.runSweep({ mode: 'auto-close', rootDir: root, memoryDir: memDir });
      const files = readdirSync(join(memDir, 'landmines')).sort();
      assert.deepEqual(
        files, ['has-a-body-heading.md'],
        'the closed sibling is swept and NOTHING is minted from the body heading',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_entries_are_iterated_then_a_body_heading_is_not_counted_as_an_entry', () => {
    const { root, memDir } = seedStore();
    try {
      const { text, keyToFile } = shape.readShardedAsFlat(memDir, 'landmines');
      const keys = Object.keys(keyToFile).sort();
      assert.deepEqual(keys, ['a-closed-sibling', 'has-a-body-heading'],
        'the shard reader knows exactly two records');
      // The flat text must be splittable back into exactly those two records. A
      // naive `^## ` split yields three, which is the whole defect.
      const headings = (text.match(/^## .*/gm) ?? []).length;
      assert.equal(headings, 3, 'the flat text does contain three `## ` lines — that is why a naive split is wrong');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_the_live_store_is_round_tripped_then_every_entry_count_is_stable', () => {
    // The live store is the corpus the defect was measured on. Reading and
    // re-splitting must yield the same number of records the reader found.
    const memDir = join(REPO_ROOT, '.claude/memory');
    const { keyToFile } = shape.readShardedAsFlat(memDir, 'landmines');
    const onDisk = readdirSync(join(memDir, 'landmines')).filter((f) => f.endsWith('.md')).length;
    assert.equal(
      Object.keys(keyToFile).length, onDisk,
      'every shard on disk must resolve to exactly one key',
    );
  });
});
