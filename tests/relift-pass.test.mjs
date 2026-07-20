// shard-migration-repair — AC-007 (the one-shot re-lift pass over the migrated
// corpus). Covers §Behavior #1 and §Rollout.
//
// 275 allowlisted bullets sit stranded in bodies today (127 verified-at, 127
// last-touched, 19 source, 1 raised-on, 1 raised-in-context — the last of which is
// NOT allowlisted and must stay put). The pass touches ~127 tracked files, so it is
// never trusted on inspection: the prose-bullet census regression below is what
// proves it lifted metadata WITHOUT eating prose.
//
// RED until: migrate.mjs exports reliftShards and the `--relift` CLI mode.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  tryImport, copyLiveCorpus, writeShard, bodyBulletCensus, snapshotTree, everyShardFile, REPO_ROOT,
} from './helpers/memory-fixtures.mjs';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const MIGRATE_REL = '.claude/skills/memory-index/migrate.mjs';
const MIGRATE_ABS = join(REPO_ROOT, MIGRATE_REL);

// Non-allowlisted names carry entry PROSE. Their count and content must be
// identical before and after the pass — this is the over-lifting tripwire.
const PROSE_NAMES = ['role', 'caveat', 'path', 'companion', 'trap', 'mitigation', 'decision', 'why'];

// Census of allowlisted body bullets belonging ONLY to the named entries — the
// entries AC-004 refuses keep theirs, so they are the expected residue.
function stranded(memDir, entryKeys) {
  const wanted = new Set(entryKeys);
  const counts = {};
  for (const file of everyShardFile(memDir)) {
    const text = readFileSync(file, 'utf8');
    const key = /^key:\s*(.+)$/m.exec(text)?.[1]?.trim();
    if (!wanted.has(key)) continue;
    const body = text.split(/^---$/m).slice(2).join('---');
    for (const line of body.split('\n')) {
      const m = /^-\s+([A-Za-z][A-Za-z-]*):\s+(.+)$/.exec(line.trim());
      if (m) counts[m[1].toLowerCase()] = (counts[m[1].toLowerCase()] || 0) + 1;
    }
  }
  return counts;
}

async function loadMigrate() {
  const mod = await tryImport(MIGRATE_REL);
  assert.ok(mod?.reliftShards, `${MIGRATE_REL} must export reliftShards`);
  return mod;
}

function seedStranded(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const memDir = join(root, '.claude', 'memory');
  mkdirSync(memDir, { recursive: true });
  writeShard(memDir, 'landmines', 'stranded-one', {
    key: 'stranded-one',
    bodyLines: [
      '- Trap: the thing that bites',
      '- Path: .claude/hooks/lib/x.mjs:12',
      '- Verified-at: abc1234',
      '- Last-touched: 2026-07-18',
    ],
  });
  writeShard(memDir, 'decisions', 'stranded-two', {
    key: 'stranded-two',
    bodyLines: ['- Decision: we chose the allowlist', '- Source: incident', '- Last-touched: 2026-07-19'],
  });
  return { root, memDir };
}

describe('relift pass — lifts every stranded bullet (AC-007)', () => {
  it('test_when_relift_runs_on_fixture_corpus_then_all_stranded_bullets_lifted', async () => {
    const { reliftShards } = await loadMigrate();
    const { root, memDir } = seedStranded('relift-fix-');
    try {
      const report = reliftShards(memDir);
      assert.equal(report.refused, 0, 'no collisions in this fixture');
      // entry one: Verified-at + Last-touched (Trap and Path are prose) = 2
      // entry two: Source + Last-touched (Decision is prose)             = 2
      assert.equal(report.relifted, 4, 'two allowlisted bullets on each of the two entries');

      const one = readFileSync(join(memDir, 'landmines', 'stranded-one.md'), 'utf8');
      assert.match(one, /^verified-at: abc1234$/m, 'lifted into frontmatter');
      assert.match(one, /^last-touched: 2026-07-18$/m);
      assert.match(one, /^- Trap: the thing that bites$/m, 'prose stays in the body');
      assert.match(one, /^- Path: \.claude\/hooks\/lib\/x\.mjs:12$/m);
      assert.ok(!/^- Verified-at:/m.test(one), 'no allowlisted bullet remains in the body');

      const census = bodyBulletCensus(memDir);
      assert.equal(census['verified-at'], undefined, 'zero stranded verified-at after the pass');
      assert.equal(census['source'], undefined, 'zero stranded source after the pass');
      assert.equal(census['trap'], 1, 'prose bullet count unchanged');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_relift_run_twice_then_second_reports_zero', async () => {
    const { reliftShards } = await loadMigrate();
    const { root, memDir } = seedStranded('relift-idem-');
    try {
      reliftShards(memDir);
      const after1 = snapshotTree(memDir);
      const report2 = reliftShards(memDir);
      assert.equal(report2.relifted, 0, 'second run finds nothing left to lift');
      assert.deepEqual(snapshotTree(memDir), after1, 'corpus byte-identical after the second run');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_relift_completes_then_prose_bullet_census_unchanged', async () => {
    const { reliftShards } = await loadMigrate();
    const { root, memDir } = copyLiveCorpus('relift-census-');
    try {
      // The live corpus is repaired, so a clone has nothing left to lift. Seed one
      // stranded entry into it: the point of this test is that lifting metadata out
      // of a body leaves the ~420 real prose bullets untouched, which needs the real
      // prose corpus AND something to actually lift.
      writeShard(memDir, 'landmines', 'census-seeded-stranded', {
        key: 'census-seeded-stranded',
        bodyLines: ['- Trap: seeded prose that must survive', '- Verified-at: abc1234'],
      });
      const before = bodyBulletCensus(memDir);
      const report = reliftShards(memDir);
      const after = bodyBulletCensus(memDir);

      for (const name of PROSE_NAMES) {
        assert.equal(after[name], before[name],
          `prose bullet "- ${name}:" count changed (${before[name]} -> ${after[name]}) — the pass is over-lifting`);
      }
      assert.ok(before['verified-at'] > 0, 'the fixture corpus really does start with stranded stamps');

      // A refused entry is left byte-untouched by design (AC-004), so its own
      // stranded bullets survive the pass. Every stranded bullet outside the
      // refused set must be gone.
      const strandedInRefused = stranded(memDir, report.collisions.map((c) => c.entryKey));
      assert.equal(after['verified-at'] ?? 0, strandedInRefused['verified-at'] ?? 0,
        'the only verified-at bullets left belong to entries AC-004 refused');
      assert.equal(after['source'] ?? 0, strandedInRefused['source'] ?? 0,
        'the only source bullets left belong to entries AC-004 refused');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_migrate_reverse_after_relift_then_roundtrips', async () => {
    const migrate = await loadMigrate();
    const { root, memDir } = seedStranded('relift-reverse-');
    try {
      migrate.reliftShards(memDir);
      migrate.migrateReverse(memDir);
      const flat = readFileSync(join(memDir, 'landmines.md'), 'utf8');
      assert.match(flat, /^- verified-at: abc1234$/m, 'lifted field re-emitted as a body bullet');
      assert.match(flat, /- Trap: the thing that bites/, 'prose survives the round trip');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_relift_cli_invoked_then_reports_json_and_exits_zero', async () => {
    const { root, memDir } = seedStranded('relift-cli-');
    try {
      const res = spawnSync('node', [MIGRATE_ABS, '--relift', '--root', memDir], { encoding: 'utf8' });
      assert.equal(res.status, 0, `--relift should exit 0 with no collisions; stderr: ${res.stderr}`);
      const report = JSON.parse(res.stdout.trim());
      assert.equal(report.refused, 0);
      assert.ok(report.relifted > 0, 'CLI reports what it lifted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
