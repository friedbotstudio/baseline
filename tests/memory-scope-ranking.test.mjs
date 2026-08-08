// Scenarios for load-bearing ranking — AC-006 of docs/specs/memory-scope-per-entry.md.
// Covers §Behavior #3.
//
// The problem ranking solves: process_lifecycle_guard renders at most INDEX_CAP (15)
// rows, and a spec write surfaces 107 hits, so 92 facts are never named. Ranking
// does not reduce the count — it decides WHICH 15 get named, using the
// `load_bearing:` marker Epic 7 slice A already populates.
//
// Sorting lives in scoped-memory.mjs alone; the guard only marks the rows. Two
// sort sites could disagree, and the guard is not the only consumer.
//
// RED until scoped-memory.mjs ranks its hits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, writeShard, tryImport } from './helpers/memory-fixtures.mjs';
import { runPreToolUseHook, writeEditPayload } from './helpers/memory-git-fixtures.mjs';

const SCOPED = '.claude/hooks/lib/scoped-memory.mjs';
const GUARD = '.claude/hooks/process_lifecycle_guard.mjs';
const PHASE = 'spec';

async function loadScoped() {
  const mod = await tryImport(SCOPED);
  assert.ok(mod, `${SCOPED} must be importable`);
  return mod;
}

function seedScoped(memDir, slug, { loadBearing = false, key = slug } = {}) {
  return writeShard(memDir, 'landmines', slug, {
    key,
    fields: { scope: `[${PHASE}]`, ...(loadBearing ? { load_bearing: 'true' } : {}) },
    bodyLines: [`> verbatim (test, 2026-08-08):`, `> lesson ${slug}`, '', `Hook line for ${slug}.`],
  });
}

function seedMany(memDir, count, prefix = 'fact') {
  for (let i = 0; i < count; i += 1) {
    seedScoped(memDir, `${prefix}-${String(i).padStart(2, '0')}`);
  }
}

// The guard surfaces through emitInfo, which writes to STDERR — stdout stays empty
// on the allow path. Reading .stdout here made both boundary assertions fail
// against correct, unchanged behaviour.
function guardOutput(root) {
  const res = runPreToolUseHook(GUARD, writeEditPayload(join(root, 'docs/specs/x.md')), root);
  return res.stderr ?? '';
}

describe('memory scope — load-bearing entries are named first (AC-006)', () => {
  it('test_when_phase_has_mixed_load_bearing_then_load_bearing_hits_rank_first', async () => {
    const { memDir, root } = makeProject();
    seedMany(memDir, 16, 'aaa-incidental');
    // The load-bearing keys sort LAST alphabetically and are written LAST, so an
    // unranked reader returns them at the tail. Naming them `critical-*` made the
    // test pass against the unranked implementation — key order alone put them
    // first, and the assertion never exercised the sort.
    for (const slug of ['zzz-critical-a', 'zzz-critical-b', 'zzz-critical-c', 'zzz-critical-d']) {
      seedScoped(memDir, slug, { loadBearing: true });
    }
    const { surfaceScopedMemory } = await loadScoped();

    const hits = surfaceScopedMemory(PHASE, { rootDir: root });
    const leadingFour = hits.slice(0, 4).map((h) => h.key).sort();

    assert.equal(hits.length, 20, 'ranking reorders; it never drops a hit');
    assert.deepEqual(
      leadingFour,
      ['zzz-critical-a', 'zzz-critical-b', 'zzz-critical-c', 'zzz-critical-d'],
      'the four load-bearing entries lead despite sorting last by key, so the 15-row index names them rather than the first 15 read off disk',
    );
  });

  it('test_when_load_bearing_ties_then_order_is_key_ascending_and_stable', async () => {
    const { memDir, root } = makeProject();
    seedScoped(memDir, 'b-second', { key: 'b-second' });
    seedScoped(memDir, 'a-first', { key: 'a-first' });
    const { surfaceScopedMemory } = await loadScoped();

    const first = surfaceScopedMemory(PHASE, { rootDir: root }).map((h) => h.key);
    const second = surfaceScopedMemory(PHASE, { rootDir: root }).map((h) => h.key);

    assert.deepEqual(first, ['a-first', 'b-second'], 'equal rank falls back to key-ascending');
    assert.deepEqual(second, first, 'repeated calls agree — the order is deterministic, not filesystem-dependent');
  });
});

describe('memory scope — render boundaries are unchanged by ranking (AC-006)', () => {
  it('test_when_hits_equal_verbatim_limit_then_output_shape_is_verbatim', async () => {
    const { memDir, root } = makeProject();
    seedMany(memDir, 3, 'trio');
    const surfaced = guardOutput(root);

    assert.match(surfaced, /verbatim \(test/, 'exactly VERBATIM_LIMIT hits still render full verbatim');
    assert.doesNotMatch(surfaced, /facts scoped to/, 'the index form is not used at the boundary');
  });

  it('test_when_hits_equal_index_cap_then_no_overflow_suffix', async () => {
    const { memDir, root } = makeProject();
    seedMany(memDir, 15, 'capped');
    const surfaced = guardOutput(root);

    assert.match(surfaced, /15 facts scoped to/, 'exactly INDEX_CAP hits render the index');
    assert.doesNotMatch(surfaced, /and \d+ more/, 'no overflow suffix when nothing overflows');
  });
});

describe('memory scope — ranking never introduces a throw (AC-006)', () => {
  it('test_when_store_absent_then_surfaceScopedMemory_returns_empty', async () => {
    const { memDir, root } = makeProject();
    rmSync(memDir, { recursive: true, force: true });
    const { surfaceScopedMemory } = await loadScoped();

    assert.deepEqual(surfaceScopedMemory(PHASE, { rootDir: root }), [], 'an absent store yields [] — unchanged behaviour');
  });

  it('test_when_one_shard_is_malformed_then_remaining_hits_still_return', async () => {
    const { memDir, root } = makeProject();
    seedScoped(memDir, 'well-formed');
    writeFileSync(join(memDir, 'landmines', 'broken.md'), '---\nkey: broken\nscope: [spec]\nno closing separator\n', 'utf8');
    const { surfaceScopedMemory } = await loadScoped();

    const keys = surfaceScopedMemory(PHASE, { rootDir: root }).map((h) => h.key);

    assert.ok(keys.includes('well-formed'), 'one malformed shard does not suppress the rest of the store');
    assert.ok(!keys.includes('broken'), 'the malformed shard is skipped rather than surfaced half-parsed');
  });
});
