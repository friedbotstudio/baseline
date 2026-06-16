// Regression suite for the sweep.mjs $-injection corruption bug.
//
// BUG: modeStampClosure (sweep.mjs:316), applyStaleAction re-verify/mark-closed
// (329/339), and modeBacklogDecay keep/drop/picked-up (365/370/375) used
// `text.replace(block, updated)`. String.prototype.replace with a STRING second
// argument interprets $`, $', $&, $$, $n in the replacement. Memory entry bodies
// contain shell snippets with $-sequences, so the replacement re-injects matched
// text and DUPLICATES the entry (observed: landmarks.md 64->214 on a restamp).
//
// Each test seeds a memory file whose body carries $`, $', $&, $$ plus a unique
// sentinel, invokes sweep.mjs, and asserts the entry was rewritten in place: ONE
// heading, sentinel appears exactly once. RED against the buggy ($&-duplicating)
// sweep.mjs; GREEN once the call sites use a $-safe splice.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SWEEP = join(REPO_ROOT, '.claude/skills/memory-flush/sweep.mjs');

const SENTINEL = 'UNIQUESENTINEL_DOLLARBUG';
// The provocative payload: every String.replace special pattern, on one body line.
// Double-quoted so the embedded ` and ' stay literal.
const DOLLAR_LINE = "- caveat: " + SENTINEL + " shell ${TMP:-/x} and $` and $' and $& and $$ tokens";
const TODAY = new Date().toISOString().slice(0, 10);

// --- Foundation: tmp memory dir + sweep invocation ---------------------------

function newMemdir() {
  return mkdtempSync(join(tmpdir(), 'sweep-dollar-'));
}

function writeMem(memdir, name, text) {
  writeFileSync(join(memdir, `${name}.md`), text, 'utf8');
}

function readMem(memdir, name) {
  return readFileSync(join(memdir, `${name}.md`), 'utf8');
}

function runSweep(memdir, args, input = '') {
  return spawnSync('node', [SWEEP, ...args, '--memory-dir', memdir], {
    input,
    encoding: 'utf8',
  });
}

function headingCount(text) {
  return (text.match(/^##\s/gm) || []).length;
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

// --- Foundation: entry builders ----------------------------------------------

function staleLandmarkFile() {
  // verified-at: HEAD + far-past last-touched -> stale via the date fallback
  // (non-git tmp dir, so the commit-distance branch is skipped).
  return [
    '## test-landmark-key:1',
    '',
    '- Role: a placeholder landmark',
    DOLLAR_LINE,
    '- verified-at: HEAD',
    '- last-touched: 2020-01-01',
    '',
  ].join('\n');
}

function backlogFile(key) {
  return [
    `## ${key}`,
    '',
    '- source: assistant-deferral',
    '- status: open',
    '- raised-on: 2020-01-01',
    DOLLAR_LINE,
    '',
  ].join('\n');
}

// --- Scenario 1 — stale-sweep re-verify --------------------------------------

describe('sweep.mjs $-injection — stale-sweep re-verify (regression, sweep.mjs:329)', () => {
  it('test_when_stale_sweep_reverify_on_entry_body_with_dollar_sequence_then_no_duplication', () => {
    const memdir = newMemdir();
    try {
      writeMem(memdir, 'landmarks', staleLandmarkFile());
      const res = runSweep(memdir, ['--mode', 'stale-sweep'], 're-verify\n');
      assert.equal(res.status, 0, `sweep exited non-zero: ${res.stderr}`);

      const out = readMem(memdir, 'landmarks');
      assert.equal(headingCount(out), 1, `entry duplicated: ${headingCount(out)} headings`);
      assert.equal(occurrences(out, SENTINEL), 1, `body re-injected: sentinel x${occurrences(out, SENTINEL)}`);
      // re-verify restamps last-touched to today, in place.
      assert.match(out, new RegExp(`- last-touched:\\s*${TODAY}`), 'last-touched not restamped to today');
    } finally {
      rmSync(memdir, { recursive: true, force: true });
    }
  });
});

// --- Scenario 2 — stale-sweep mark-closed ------------------------------------

describe('sweep.mjs $-injection — stale-sweep mark-closed (regression, sweep.mjs:339)', () => {
  it('test_when_stale_sweep_mark_closed_on_entry_body_with_dollar_sequence_then_no_duplication', () => {
    const memdir = newMemdir();
    try {
      writeMem(memdir, 'landmarks', staleLandmarkFile());
      const res = runSweep(memdir, ['--mode', 'stale-sweep'], 'mark-closed\n');
      assert.equal(res.status, 0, `sweep exited non-zero: ${res.stderr}`);

      const out = readMem(memdir, 'landmarks');
      assert.equal(headingCount(out), 1, `entry duplicated: ${headingCount(out)} headings`);
      assert.equal(occurrences(out, SENTINEL), 1, `body re-injected: sentinel x${occurrences(out, SENTINEL)}`);
      // landmarks' register closure field is superseded-at, inserted exactly once.
      assert.equal(occurrences(out, '- superseded-at:'), 1, 'closure field not added exactly once');
    } finally {
      rmSync(memdir, { recursive: true, force: true });
    }
  });
});

// --- Scenario 3 — stamp-closure (backlog) ------------------------------------

describe('sweep.mjs $-injection — stamp-closure (regression, sweep.mjs:316)', () => {
  it('test_when_stamp_closure_on_backlog_entry_body_with_dollar_sequence_then_no_duplication', () => {
    const memdir = newMemdir();
    const key = 'my-backlog-key-aaaa';
    try {
      writeMem(memdir, 'backlog', backlogFile(key));
      const res = runSweep(memdir, ['--mode', 'stamp-closure', '--backlog-keys', key]);
      assert.equal(res.status, 0, `sweep exited non-zero: ${res.stderr}`);
      assert.match(res.stdout, /"stamped":\s*1/, `report not stamped:1 -> ${res.stdout}`);

      const out = readMem(memdir, 'backlog');
      assert.equal(headingCount(out), 1, `entry duplicated: ${headingCount(out)} headings`);
      assert.equal(occurrences(out, SENTINEL), 1, `body re-injected: sentinel x${occurrences(out, SENTINEL)}`);
      assert.match(out, /- status:\s*picked-up/, 'status not flipped to picked-up');
      assert.equal(occurrences(out, '- superseded-at:'), 1, 'superseded-at not added exactly once');
    } finally {
      rmSync(memdir, { recursive: true, force: true });
    }
  });
});

// --- Scenario 4 — backlog-decay drop -----------------------------------------

describe('sweep.mjs $-injection — backlog-decay drop (regression, sweep.mjs:365/370/375)', () => {
  it('test_when_backlog_decay_drop_on_entry_body_with_dollar_sequence_then_no_duplication', () => {
    const memdir = newMemdir();
    const key = 'decay-backlog-key-bbbb';
    try {
      writeMem(memdir, 'backlog', backlogFile(key));
      const res = runSweep(memdir, ['--mode', 'backlog-decay', '--threshold-days', '0'], 'drop\n');
      assert.equal(res.status, 0, `sweep exited non-zero: ${res.stderr}`);

      const out = readMem(memdir, 'backlog');
      assert.equal(headingCount(out), 1, `entry duplicated: ${headingCount(out)} headings`);
      assert.equal(occurrences(out, SENTINEL), 1, `body re-injected: sentinel x${occurrences(out, SENTINEL)}`);
      assert.match(out, /- status:\s*dropped/, 'status not flipped to dropped');
      assert.equal(occurrences(out, '- superseded-at:'), 1, 'superseded-at not added exactly once');
    } finally {
      rmSync(memdir, { recursive: true, force: true });
    }
  });
});
