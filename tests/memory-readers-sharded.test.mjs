// shard-migration-repair — AC-008..AC-013 + AC-017 (every code consumer of the
// memory store resolves the sharded shape, and flat stores still work).
// Covers §Behavior #4.
//
// The T4 migration landed the new store without updating every reader. Confirmed
// blind today:
//   gather.mjs:117,152   — reports an EMPTY backlog while 16 shards exist
//   next-q-id.mjs:22     — returns Q-001 while Q-002 is on disk (it exists to
//                          prevent exactly that collision)
//   retrieve.mjs:46      — .filter(existsSync) makes /research silently retrieve
//                          nothing and derive fresh, believing it searched
//   commit-split.mjs:22  — endsWith('backlog.md') never matches backlog/<slug>.md,
//                          so closure loses last-position and the guard blocks
//
// scoped-memory.mjs and build-index.mjs are shard-ONLY, so they are silently inert
// on a fresh consumer install (build-template.sh:237 ships a FLAT store).
//
// Resolution is SHARD-FIRST: a failed migrateForward leaves BOTH stores present
// (it writes shards, asserts, then deletes flat), and the shards are newer truth.
//
// RED until: a shared resolveCategory lands and every reader above routes through it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  tryImport, copyLiveCorpus, writeShard, writeFlatCategory, REPO_ROOT,
} from './helpers/memory-fixtures.mjs';

const LIFT_FIELDS_REL = '.claude/skills/memory-index/lift-fields.mjs';
const GATHER_REL = '.claude/skills/standup/gather.mjs';
const NEXT_Q_ID_ABS = join(REPO_ROOT, '.claude/skills/memory-flush/next-q-id.mjs');
const RETRIEVE_REL = '.claude/skills/research/retrieve.mjs';
const COMMIT_SPLIT_REL = '.claude/skills/power/commit-split.mjs';
const SCOPED_MEMORY_REL = '.claude/hooks/lib/scoped-memory.mjs';
const BUILD_INDEX_REL = '.claude/skills/memory-index/build-index.mjs';

function freshRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const memDir = join(root, '.claude', 'memory');
  mkdirSync(memDir, { recursive: true });
  return { root, memDir };
}

describe('shared category resolution — shard-first (AC-008, AC-017)', () => {
  it('test_when_both_stores_present_then_shard_first_resolution_wins', async () => {
    const lifter = await tryImport(LIFT_FIELDS_REL);
    assert.ok(lifter?.resolveCategory, `${LIFT_FIELDS_REL} must export resolveCategory`);
    const { root, memDir } = freshRoot('resolve-both-');
    try {
      writeFlatCategory(memDir, 'backlog', [{ key: 'stale-flat-entry', bodyLines: ['- status: open'] }]);
      writeShard(memDir, 'backlog', 'fresh-shard-entry', {
        key: 'fresh-shard-entry', fields: { status: 'open' },
      });
      const result = lifter.resolveCategory(memDir, 'backlog');
      assert.equal(result.source, 'sharded', 'shards win — a failed migrateForward leaves both and shards are newer');
      assert.deepEqual(result.entries.map((e) => e.key), ['fresh-shard-entry']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_neither_store_present_then_degraded_marker_honest', async () => {
    const lifter = await tryImport(LIFT_FIELDS_REL);
    assert.ok(lifter?.resolveCategory, `${LIFT_FIELDS_REL} must export resolveCategory`);
    const { root, memDir } = freshRoot('resolve-none-');
    try {
      const result = lifter.resolveCategory(memDir, 'backlog');
      assert.equal(result.source, 'absent', 'the "absent" signal keeps its honest store-missing meaning');
      assert.deepEqual(result.entries, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_shard_has_malformed_frontmatter_then_entry_degraded_others_returned', async () => {
    const lifter = await tryImport(LIFT_FIELDS_REL);
    assert.ok(lifter?.resolveCategory, `${LIFT_FIELDS_REL} must export resolveCategory`);
    const { root, memDir } = freshRoot('resolve-bad-');
    try {
      writeShard(memDir, 'backlog', 'good-entry', { key: 'good-entry', fields: { status: 'open' } });
      mkdirSync(join(memDir, 'backlog'), { recursive: true });
      writeFileSync(join(memDir, 'backlog', 'broken.md'), 'no frontmatter at all\n', 'utf8');
      const result = lifter.resolveCategory(memDir, 'backlog');
      assert.deepEqual(result.entries.map((e) => e.key), ['good-entry'],
        'one bad file never zeroes the store');
      assert.ok((result.degraded ?? []).some((d) => /broken/.test(d)),
        'the unparseable shard is named in degraded[]');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('standup gather — sharded backlog and questions (AC-008, AC-009)', () => {
  it('test_when_sharded_backlog_then_gather_returns_all_entries_with_parent_nesting', async () => {
    const gather = await tryImport(GATHER_REL);
    assert.ok(gather?.gatherSync, `${GATHER_REL} must export gatherSync`);
    const { root, memDir } = copyLiveCorpus('gather-backlog-');
    try {
      const recap = gather.gatherSync({ rootDir: root });
      const total = recap.backlog.open.length + recap.backlog.pickedUp.length + recap.backlog.dropped.length;
      assert.equal(total, 16, 'all 16 real backlog shards are returned');
      assert.ok(!recap.degraded.includes('no-backlog'),
        'degraded must not claim the backlog is missing when 16 shards exist');

      const nested = recap.backlog.open.filter((e) => Array.isArray(e.children) && e.children.length > 0);
      assert.ok(nested.length >= 1,
        'the 4 shards carrying parent: must nest under their epic parent, not flatten');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_sharded_pending_questions_then_gather_returns_question', async () => {
    const gather = await tryImport(GATHER_REL);
    assert.ok(gather?.gatherSync, `${GATHER_REL} must export gatherSync`);
    const { root } = copyLiveCorpus('gather-questions-');
    try {
      const recap = gather.gatherSync({ rootDir: root });
      assert.equal(recap.pendingQuestions.length, 1, 'the single real pending-questions shard is returned');
      assert.match(recap.pendingQuestions[0].id ?? recap.pendingQuestions[0].key ?? '', /Q-002/);
      assert.ok(!recap.degraded.includes('no-pending-questions'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('next-q-id — reads the id from frontmatter (AC-010)', () => {
  it('test_when_sharded_questions_then_next_q_id_reads_frontmatter_key', () => {
    const { root, memDir } = freshRoot('nextq-');
    try {
      // Filename is a lowercase CWE-22-safe slug; the id lives in `key:`. Reading
      // the filename would fail the /Q-(\d+)/ match and silently restart at Q-001.
      writeShard(memDir, 'pending-questions', 'q-002-is-the-size-cap-ratified', {
        key: 'Q-002 — Is `landmarks.md`\'s `size-cap: 700` ratified?',
        fields: { status: 'open' },
      });
      const res = spawnSync('node', [NEXT_Q_ID_ABS, '--memory-dir', memDir], { encoding: 'utf8' });
      assert.equal(res.status, 0, `next-q-id should exit 0; stderr: ${res.stderr}`);
      assert.equal(res.stdout.trim(), 'Q-003',
        'must allocate past the sharded Q-002 — returning Q-001 is the collision this script exists to prevent');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('research retrieve — sharded decision corpus (AC-011)', () => {
  it('test_when_sharded_store_then_retrieve_includes_decisions_and_libraries', async () => {
    const retrieve = await tryImport(RETRIEVE_REL);
    assert.ok(retrieve, `${RETRIEVE_REL} must be importable`);
    const { root, memDir } = freshRoot('retrieve-');
    try {
      writeShard(memDir, 'decisions', 'chose-allowlist', {
        key: 'chose-allowlist', bodyLines: ['We chose a reader-derived allowlist over a case-insensitive regex.'],
      });
      writeShard(memDir, 'libraries', 'node-test-runner', {
        key: 'node-test-runner', bodyLines: ['node:test is the suite runner.'],
      });
      const result = retrieve.retrieve({ root, terms: ['allowlist'] });
      const blob = JSON.stringify(result);
      assert.match(blob, /chose-allowlist/,
        'sharded decisions must be searchable — .filter(existsSync) on a flat path silently returns nothing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('power commit-split — sharded closure ordering (AC-012)', () => {
  it('test_when_sharded_closure_path_then_commit_split_classifies_and_orders_last', async () => {
    const split = await tryImport(COMMIT_SPLIT_REL);
    assert.ok(split?.planCommits, `${COMMIT_SPLIT_REL} must export planCommits`);
    const entries = [
      { path: '.claude/skills/memory-index/lift-fields.mjs', status: 'A' },
      { path: 'docs/handoff/baseline-system-redesign-roadmap.md', status: 'M' },
      { path: '.claude/memory/backlog/repair-shard-migration-field-lifting-and-stale-readers-b4e1.md', status: 'M' },
      { path: '.claude/state/workflow.json', status: 'M' },
    ];
    const groups = split.planCommits(entries);
    const last = groups[groups.length - 1];
    const lastPaths = last.paths ?? last.files ?? [];
    assert.ok(
      lastPaths.some((p) => p.includes('.claude/memory/backlog/')),
      'a sharded backlog closure entry must land in the LAST group — endsWith("backlog.md") never matches backlog/<slug>.md',
    );
    assert.ok(
      lastPaths.some((p) => p.endsWith('workflow.json')),
      'closure rides with workflow.json in the same final commit',
    );
  });

  // Security review 2026-07-20, MEDIUM (CWE-625): the sharded clause used an
  // unanchored `includes`, so any path merely CONTAINING the fragment reordered
  // into the closure commit. Repo paths are root-relative, so the prefix form is
  // exact — matching how the sibling flat clause is already anchored.
  it('test_when_path_merely_contains_backlog_fragment_then_not_closure', async () => {
    const split = await tryImport(COMMIT_SPLIT_REL);
    assert.ok(split?.planCommits, `${COMMIT_SPLIT_REL} must export planCommits`);

    const decoys = [
      'docs/archive/2026-01-01/x/.claude/memory/backlog/old.md',
      'src/thing/.claude/memory/backlog/evil.md',
      'docs/notes-about-.claude/memory/backlog/-naming.md',
    ];
    const groups = split.planCommits([
      { path: '.claude/memory/backlog/real-entry.md', status: 'M' },
      { path: '.claude/state/workflow.json', status: 'M' },
      ...decoys.map((path) => ({ path, status: 'M' })),
    ]);
    const lastPaths = groups[groups.length - 1].paths ?? groups[groups.length - 1].files ?? [];

    for (const decoy of decoys) {
      assert.ok(!lastPaths.includes(decoy),
        `"${decoy}" only CONTAINS the closure fragment and must not be reordered into the closure commit`);
    }
    assert.ok(lastPaths.includes('.claude/memory/backlog/real-entry.md'),
      'the genuine root-relative closure entry still classifies');
  });
});

describe('shard-only readers become dual-mode (AC-013)', () => {
  it('test_when_flat_store_then_scoped_memory_and_build_index_return_entries', async () => {
    const scoped = await tryImport(SCOPED_MEMORY_REL);
    const index = await tryImport(BUILD_INDEX_REL);
    assert.ok(scoped?.surfaceScopedMemory, `${SCOPED_MEMORY_REL} must export surfaceScopedMemory`);
    assert.ok(index?.buildIndex, `${BUILD_INDEX_REL} must export buildIndex`);

    const { root, memDir } = freshRoot('flat-consumer-');
    try {
      // The shape build-template.sh:237 ships to every fresh consumer install.
      writeFlatCategory(memDir, 'landmines', [{
        key: 'flat-landmine',
        bodyLines: ['- scope: [spec]', '- Trap: bites on a flat store'],
      }]);
      writeFlatCategory(memDir, 'decisions', [{ key: 'flat-decision', bodyLines: ['- Decision: keep it flat'] }]);

      const built = index.buildIndex(memDir);
      const indexBlob = JSON.stringify(built);
      assert.match(indexBlob, /flat-landmine/,
        'build-index must read a flat store — returning empty makes the feature silently inert on fresh installs');

      const surfaced = scoped.surfaceScopedMemory('spec', { rootDir: root });
      assert.match(JSON.stringify(surfaced), /flat-landmine/,
        'scoped-memory must read a flat store for the same reason');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_flat_store_then_every_reader_unchanged_from_today', async () => {
    const gather = await tryImport(GATHER_REL);
    assert.ok(gather?.gatherSync, `${GATHER_REL} must export gatherSync`);
    const { root, memDir } = freshRoot('flat-backcompat-');
    try {
      writeFlatCategory(memDir, 'backlog', [
        { key: 'flat-a', bodyLines: ['- status: open', '- Intent: do a thing'] },
        { key: 'flat-b', bodyLines: ['- status: dropped', '- Intent: do another'] },
      ]);
      const recap = gather.gatherSync({ rootDir: root });
      const total = recap.backlog.open.length + recap.backlog.pickedUp.length + recap.backlog.dropped.length;
      assert.equal(total, 2, 'flat entries still parse');
      assert.equal(recap.backlog.dropped.length, 1, 'flat status bucketing unchanged');
      assert.ok(!recap.degraded.includes('no-backlog'), 'a populated flat store is not degraded');

      const res = spawnSync('node', [NEXT_Q_ID_ABS, '--memory-dir', memDir], { encoding: 'utf8' });
      assert.equal(res.status, 0);
      assert.equal(res.stdout.trim(), 'Q-001', 'no questions in a flat store with no file — unchanged behavior');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
