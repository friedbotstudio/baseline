// Tests for .claude/skills/upgrade-project/marker.mjs — the shipped CLI
// helper that writes <target>/.claude/.baseline-reconciliations.json from the
// /upgrade-project skill's terminal in a consumer install (where src/cli/ is
// absent). Mirrors the write-side behavior of src/cli/reconciliation-marker.js
// → recordReconciliation, plus a parity assertion that the two writers produce
// byte-identical markers (modulo the reconciled_at timestamp).
//
// Spec: docs/specs/marker-helper-shipped-instead-of-dev-import.md

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const HELPER_PATH = join(repoRoot, '.claude/skills/upgrade-project/marker.mjs');
const MARKER_REL = '.claude/.baseline-reconciliations.json';

// Guarded import of the CLI-side library for the byte-parity test. Stays
// resolvable at RED time because src/cli/reconciliation-marker.js already
// exists; the helper module is what's new.
let libMarker;
try {
  libMarker = await import('../src/cli/reconciliation-marker.js');
} catch (err) {
  throw new Error(
    `cannot import src/cli/reconciliation-marker.js (pre-existing module): ${err.message}`,
  );
}

async function makeEmptyTarget() {
  const target = await mkdtemp(join(tmpdir(), 'marker-helper-'));
  await mkdir(join(target, '.claude'), { recursive: true });
  return target;
}

async function seedMarker(target, entries) {
  await mkdir(join(target, '.claude'), { recursive: true });
  await writeFile(
    join(target, MARKER_REL),
    JSON.stringify({ schema_version: 1, reconciliations: entries }, null, 2) + '\n',
  );
}

async function readMarker(target) {
  const bytes = await readFile(join(target, MARKER_REL), 'utf8');
  return JSON.parse(bytes);
}

function runHelper(args) {
  return spawnSync('node', [HELPER_PATH, ...args], { encoding: 'utf8' });
}

function dropTimestamps(marker) {
  const clone = JSON.parse(JSON.stringify(marker));
  for (const rel of Object.keys(clone.reconciliations ?? {})) {
    delete clone.reconciliations[rel].reconciled_at;
  }
  return clone;
}

describe('upgrade-project/marker.mjs — record CLI', () => {
  // AC-001 — marker write succeeds in consumer install (golden + boundary + negative + concurrency)
  // AC-002 — byte parity with src/cli/reconciliation-marker.js modulo timestamp
  it('test_when_marker_record_against_empty_target_then_writes_marker_with_expected_entry', async () => {
    const target = await makeEmptyTarget();
    try {
      const result = runHelper(['record', target, 'docs/init/seed.md', '0.9.0', 'a'.repeat(64)]);
      assert.equal(result.status, 0, `expected exit 0; got ${result.status}; stderr=${result.stderr}`);

      const marker = await readMarker(target);
      assert.equal(marker.schema_version, 1);
      const entry = marker.reconciliations['docs/init/seed.md'];
      assert.ok(entry, 'expected an entry for docs/init/seed.md');
      assert.equal(entry.baseline_version, '0.9.0');
      assert.equal(entry.reconciled_against_template_sha, 'a'.repeat(64));
      assert.match(entry.reconciled_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        'reconciled_at must be a valid ISO-8601 timestamp');
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  it('test_when_marker_record_with_five_existing_entries_then_appends_sixth_preserving_all', async () => {
    const target = await makeEmptyTarget();
    try {
      const seed = {
        a: { baseline_version: '0.8.0', reconciled_against_template_sha: '1'.repeat(64), reconciled_at: '2026-01-01T00:00:00.000Z' },
        b: { baseline_version: '0.8.0', reconciled_against_template_sha: '2'.repeat(64), reconciled_at: '2026-01-02T00:00:00.000Z' },
        c: { baseline_version: '0.8.0', reconciled_against_template_sha: '3'.repeat(64), reconciled_at: '2026-01-03T00:00:00.000Z' },
        d: { baseline_version: '0.8.0', reconciled_against_template_sha: '4'.repeat(64), reconciled_at: '2026-01-04T00:00:00.000Z' },
        e: { baseline_version: '0.8.0', reconciled_against_template_sha: '5'.repeat(64), reconciled_at: '2026-01-05T00:00:00.000Z' },
      };
      await seedMarker(target, seed);

      const result = runHelper(['record', target, 'f', '0.9.0', '6'.repeat(64)]);
      assert.equal(result.status, 0, `expected exit 0; stderr=${result.stderr}`);

      const marker = await readMarker(target);
      assert.equal(marker.schema_version, 1);
      assert.deepEqual(Object.keys(marker.reconciliations).sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
      // Pre-existing entries must be byte-equal to seed.
      for (const rel of ['a', 'b', 'c', 'd', 'e']) {
        assert.deepEqual(marker.reconciliations[rel], seed[rel],
          `entry ${rel} must be unchanged after appending a new entry`);
      }
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  it('test_when_marker_record_replaces_existing_rel_then_other_entries_untouched', async () => {
    const target = await makeEmptyTarget();
    try {
      const seed = {
        x: { baseline_version: '0.8.0', reconciled_against_template_sha: 'old'.padEnd(64, '0'), reconciled_at: '2026-01-01T00:00:00.000Z' },
        y: { baseline_version: '0.8.0', reconciled_against_template_sha: 'y'.repeat(64), reconciled_at: '2026-01-02T00:00:00.000Z' },
        z: { baseline_version: '0.8.0', reconciled_against_template_sha: 'z'.repeat(64), reconciled_at: '2026-01-03T00:00:00.000Z' },
      };
      await seedMarker(target, seed);

      const result = runHelper(['record', target, 'x', '0.9.0', 'new'.padEnd(64, '1')]);
      assert.equal(result.status, 0, `expected exit 0; stderr=${result.stderr}`);

      const marker = await readMarker(target);
      assert.equal(marker.reconciliations.x.baseline_version, '0.9.0',
        'rel x must have updated baseline_version');
      assert.equal(marker.reconciliations.x.reconciled_against_template_sha, 'new'.padEnd(64, '1'),
        'rel x must have updated template_sha');
      assert.notEqual(marker.reconciliations.x.reconciled_at, seed.x.reconciled_at,
        'rel x must have refreshed reconciled_at');
      assert.deepEqual(marker.reconciliations.y, seed.y, 'rel y must be unchanged');
      assert.deepEqual(marker.reconciliations.z, seed.z, 'rel z must be unchanged');
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  it('test_when_helper_and_lib_invoked_with_same_args_then_produce_byte_equal_markers_modulo_timestamp', async () => {
    const targetA = await makeEmptyTarget();
    const targetB = await makeEmptyTarget();
    try {
      const args = { rel: 'docs/init/seed.md', baselineVersion: '0.9.0', sha: 'c'.repeat(64) };

      // Path 1: the CLI library's recordReconciliation (in-process call).
      await libMarker.recordReconciliation(targetA, args.rel, args.baselineVersion, args.sha);

      // Path 2: the shipped helper CLI (subprocess).
      const result = runHelper(['record', targetB, args.rel, args.baselineVersion, args.sha]);
      assert.equal(result.status, 0, `helper exit 0; stderr=${result.stderr}`);

      const markerA = await readMarker(targetA);
      const markerB = await readMarker(targetB);
      assert.deepEqual(dropTimestamps(markerB), dropTimestamps(markerA),
        'helper marker JSON must equal lib marker JSON modulo reconciled_at');
    } finally {
      await rm(targetA, { recursive: true, force: true });
      await rm(targetB, { recursive: true, force: true });
    }
  });

  it('test_when_marker_record_missing_positional_args_then_exits_2_with_usage', async () => {
    for (const args of [
      ['record'],
      ['record', '/tmp/somewhere'],
      ['record', '/tmp/somewhere', 'rel'],
      ['record', '/tmp/somewhere', 'rel', '0.9.0'],
    ]) {
      const result = runHelper(args);
      assert.equal(result.status, 2,
        `expected exit 2 for args ${JSON.stringify(args)}; got ${result.status}`);
      assert.match(result.stderr, /usage:/i,
        `stderr must contain "usage:" for short args; got ${result.stderr}`);
    }
  });

  it('test_when_marker_invoked_with_unknown_subcommand_then_exits_2_with_usage', async () => {
    const result = runHelper(['wat']);
    assert.equal(result.status, 2, `expected exit 2; got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /unknown subcommand: wat/,
      'stderr must name the unknown subcommand');
    assert.match(result.stderr, /usage:/i, 'stderr must contain usage line');
  });

  it('test_when_marker_record_against_readonly_target_then_exits_1_and_preserves_existing_marker', async () => {
    const target = await makeEmptyTarget();
    try {
      const seed = {
        existing: { baseline_version: '0.8.0', reconciled_against_template_sha: 'e'.repeat(64), reconciled_at: '2026-01-01T00:00:00.000Z' },
      };
      await seedMarker(target, seed);
      const seedBytes = await readFile(join(target, MARKER_REL), 'utf8');

      await chmod(join(target, '.claude'), 0o555);
      try {
        const result = runHelper(['record', target, 'new', '0.9.0', 'n'.repeat(64)]);
        assert.equal(result.status, 1,
          `expected exit 1 on readonly target; got ${result.status}; stderr=${result.stderr}`);
        assert.match(result.stderr, /cannot write \.claude\/\.baseline-reconciliations\.json/,
          'stderr must name the marker path');

        const afterBytes = await readFile(join(target, MARKER_REL), 'utf8');
        assert.equal(afterBytes, seedBytes,
          'existing marker bytes must be unchanged after a failed write');
      } finally {
        await chmod(join(target, '.claude'), 0o755);
      }
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  it('test_when_two_sequential_marker_record_invocations_then_both_lands_no_tmp_leaks', async () => {
    const target = await makeEmptyTarget();
    try {
      const r1 = runHelper(['record', target, 'first', '0.9.0', '1'.repeat(64)]);
      assert.equal(r1.status, 0, `first record exit 0; stderr=${r1.stderr}`);
      const r2 = runHelper(['record', target, 'second', '0.9.0', '2'.repeat(64)]);
      assert.equal(r2.status, 0, `second record exit 0; stderr=${r2.stderr}`);

      const marker = await readMarker(target);
      assert.ok(marker.reconciliations.first, 'first entry must persist');
      assert.ok(marker.reconciliations.second, 'second entry must persist (no lost write)');

      const entries = await readdir(join(target, '.claude'));
      const tmpSiblings = entries.filter((n) => n.includes('.tmp'));
      assert.deepEqual(tmpSiblings, [],
        `no .tmp siblings expected after sequential writes; got ${JSON.stringify(entries)}`);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});
