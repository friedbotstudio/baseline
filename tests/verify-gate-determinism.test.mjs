// T11 — the binding verify gate is non-deterministic under load.
//
// tests/publish-check.test.mjs caps check-files-diff.mjs at 30s. That script runs
// `npm pack --dry-run` over the whole package: 2s standalone (measured three
// times), but killed at 30s when 3,287 sibling tests compete for the CPU.
// spawnSync reports a kill as status=null, so the suite reads FAIL.
//
// Across three full-suite runs on 2026-08-24 it failed, passed, then failed.
//
// This is not one flaky test. `.claude/state/last_test_result` is the gate the whole
// workflow rests on, and a wall-clock cap inside a parallel runner measures machine
// load rather than the thing under test.
//
// Scoped to the ONE spawn measured. The file holds fourteen other caps below this
// floor; raising them on the strength of a measurement of a different script would
// be guessing, and a short cap is correct for a test asserting a fast failure path.
//
// RED until: the check-files-diff spawn clears the heavy floor.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLISH_CHECK = join(REPO_ROOT, 'tests/publish-check.test.mjs');

// The floor already in use for heavyweight subprocesses in the same file. A cap
// below it says "this is lighter than an npm pack", which for the one spawn that
// IS an npm pack is false.
const HEAVY_FLOOR_MS = 180_000;

// The cap on the CHECK_FILES_DIFF spawn specifically — the first `timeout:` after
// that spawn opens.
function checkFilesDiffCap(source) {
  const at = source.indexOf('spawnSync(\'node\', [CHECK_FILES_DIFF]');
  assert.ok(at >= 0, 'the check-files-diff spawn must still be there for this guard to mean anything');
  const cap = /timeout:\s*([0-9_]+)/.exec(source.slice(at));
  assert.ok(cap, 'that spawn must carry an explicit cap — an uncapped spawnSync can hang the suite');
  return Number(cap[1].replace(/_/g, ''));
}

describe('AC-022 — the npm-pack spawn is not capped below what a loaded machine needs', () => {
  it('test_when_the_check_files_diff_cap_is_read_then_it_clears_the_heavy_floor', () => {
    const cap = checkFilesDiffCap(readFileSync(PUBLISH_CHECK, 'utf8'));
    assert.ok(
      cap >= HEAVY_FLOOR_MS,
      `the npm-pack spawn is capped at ${cap}ms, under the ${HEAVY_FLOOR_MS}ms floor. `
      + 'A cap tuned to an idle machine turns the binding verify verdict into a load measurement.'
    );
  });

  it('test_when_the_script_runs_unstarved_then_it_is_fast_so_the_cap_is_the_defect', () => {
    // Pins the premise rather than trusting it. If check-files-diff ever becomes
    // genuinely slow, this fails and the diagnosis above stops being true — a
    // bigger cap would then be papering over a real regression.
    const started = Date.now();
    execFileSync('node', [join(REPO_ROOT, 'scripts/check-files-diff.mjs')], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: HEAVY_FLOOR_MS,
    });
    assert.ok(
      Date.now() - started < 60_000,
      'check-files-diff is a fast script; a genuine slowdown needs a different fix than a bigger cap'
    );
  });
});
