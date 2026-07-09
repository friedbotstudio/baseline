// Tests for graph.mjs — soft/seam edges (roadmap-planner).
// Runs the CLI as a subprocess against fixture tasks.json files and asserts
// stdout substrings + exit codes. Node stdlib only (node:test, node:assert).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const graphPath = fileURLToPath(new URL('./graph.mjs', import.meta.url));
const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), 'graph-test-'));
let tmpSeq = 0;

// Foundation — run the CLI, capture {status, out}.
function runGraph(cmd, tasksPath) {
  const r = spawnSync(process.execPath, [graphPath, cmd, tasksPath], { encoding: 'utf8' });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// Foundation — materialize an inline fixture to a temp file, return its path.
function writeTmp(obj) {
  const p = join(workDir, `t${process.pid}-${tmpSeq++}.json`);
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

const committed = (name) => join(fixturesDir, name);
const orderIndex = (out, id) => out.split('\n').findIndex((l) => l.includes(id));
const countOccurrences = (out, needle) => out.split(needle).length - 1;

test('AC-001: a seam floats before its consumer despite a later bucket/id', () => {
  const p = writeTmp({
    buckets: ['platform', 'solution', 'web', 'app'],
    tasks: [
      { id: 'z_seam', epic: 'E1', bucket: 'web', category: 'Infrastructure', title: 'seam', deps: [] },
      { id: 'a_consumer', epic: 'E1', bucket: 'platform', category: 'Business Logic', title: 'consumer', deps: [], seamDeps: ['z_seam'] },
    ],
  });
  const { status, out } = runGraph('order', p);
  assert.equal(status, 0, out);
  assert.ok(orderIndex(out, 'z_seam') > -1 && orderIndex(out, 'a_consumer') > -1, out);
  assert.ok(orderIndex(out, 'z_seam') < orderIndex(out, 'a_consumer'), `seam should precede consumer:\n${out}`);
});

test('AC-002a: a seam edge that would cycle against a hard edge is relaxed, exit 0', () => {
  const p = writeTmp({
    buckets: ['platform', 'solution', 'web', 'app'],
    tasks: [
      { id: 'consumerY', epic: 'E1', bucket: 'platform', category: 'Business Logic', title: 'consumer', deps: [], seamDeps: ['seamX'] },
      { id: 'seamX', epic: 'E2', bucket: 'platform', category: 'Infrastructure', title: 'seam that hard-needs the consumer', deps: ['consumerY'] },
    ],
  });
  const { status, out } = runGraph('order', p);
  assert.equal(status, 0, out);
  assert.match(out, /relaxed/, out);
  assert.match(out, /seamX/, out);
});

test('AC-002b: a mutual soft cycle relaxes exactly one edge, order exit 0 (not a hard cycle)', () => {
  const p = writeTmp({
    buckets: ['platform', 'solution', 'web', 'app'],
    tasks: [
      { id: 'aaa', epic: 'E1', bucket: 'platform', category: 'Infrastructure', title: 'a', deps: [], seamDeps: ['bbb'] },
      { id: 'bbb', epic: 'E1', bucket: 'platform', category: 'Infrastructure', title: 'b', deps: [], seamDeps: ['aaa'] },
    ],
  });
  const { status, out } = runGraph('order', p);
  assert.equal(status, 0, `mutual soft cycle must not be a hard cycle (exit 2):\n${out}`);
  assert.equal(countOccurrences(out, 'relaxed'), 1, `exactly one relaxation expected:\n${out}`);
  assert.ok(orderIndex(out, 'aaa') > -1 && orderIndex(out, 'bbb') > -1, out);
});

test('AC-003: seam-after-consumer is a blocker, exit 3 (committed fixture)', () => {
  const { status, out } = runGraph('analyze', committed('seam-after-consumer.json'));
  assert.equal(status, 3, out);
  assert.match(out, /seam-after-consumer/, out);
});

test('AC-004: a hard cycle in deps still exits 2; seamDeps do not affect hard-cycle detection', () => {
  const p = writeTmp({
    buckets: ['platform', 'solution', 'web', 'app'],
    tasks: [
      { id: 'pp', epic: 'E1', bucket: 'platform', category: 'Infrastructure', title: 'p', deps: ['qq'] },
      { id: 'qq', epic: 'E1', bucket: 'platform', category: 'Infrastructure', title: 'q', deps: ['pp'] },
      { id: 'rr', epic: 'E1', bucket: 'web', category: 'Interface', title: 'r', deps: [], seamDeps: ['pp'] },
    ],
  });
  const { status, out } = runGraph('analyze', p);
  assert.equal(status, 2, out);
  assert.ok(out.includes('pp') && out.includes('qq'), `cycle path should name pp and qq:\n${out}`);
});

test('AC-005: a soft-linked pair is not offered as a compact merge candidate', () => {
  const p = writeTmp({
    buckets: ['platform', 'solution', 'web', 'app'],
    tasks: [
      { id: 'task_ma', epic: 'E1', bucket: 'platform', category: 'Business Logic', title: 'ma', deps: [], seamDeps: ['task_mb'] },
      { id: 'task_mb', epic: 'E1', bucket: 'platform', category: 'Business Logic', title: 'mb', deps: [] },
    ],
  });
  const { status, out } = runGraph('compact', p);
  assert.equal(status, 0, out);
  const mergesBoth = out.split('\n').some((l) => l.includes('task_ma') && l.includes('task_mb'));
  assert.ok(!mergesBoth, `soft-linked pair must not be a merge candidate:\n${out}`);
});

test('AC-006: a dangling seamDeps id exits 1', () => {
  const p = writeTmp({
    buckets: ['platform', 'solution', 'web', 'app'],
    tasks: [
      { id: 'solo', epic: 'E1', bucket: 'platform', category: 'Infrastructure', title: 'solo', deps: [], seamDeps: ['nope'] },
    ],
  });
  const { status, out } = runGraph('analyze', p);
  assert.equal(status, 1, out);
  assert.match(out, /dangling/i, out);
});

test('AC-007: no seamDeps anywhere -> legacy summary shape, no relaxations key, exit 0', () => {
  const { status, out } = runGraph('analyze', committed('legacy-3task.json'));
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /relaxations/, `legacy output must not carry the seam-only key:\n${out}`);
  assert.match(out, /orderChecked/, `legacy summary shape expected:\n${out}`);
});
