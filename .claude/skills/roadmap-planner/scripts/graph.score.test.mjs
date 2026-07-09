// Tests for graph.mjs — two-lens WSJF priority scoring (order tiebreak).
// Node stdlib only. Runs the CLI as a subprocess against temp fixtures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const graphPath = fileURLToPath(new URL('./graph.mjs', import.meta.url));
const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), 'graph-score-'));
let seq = 0;

function runGraph(cmd, tasksPath) {
  const r = spawnSync(process.execPath, [graphPath, cmd, tasksPath], { encoding: 'utf8' });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function writeTmp(obj) {
  const p = join(workDir, `s${process.pid}-${seq++}.json`);
  writeFileSync(p, JSON.stringify(obj));
  return p;
}
const idx = (out, id) => out.split('\n').findIndex((l) => l.includes(id));
const B = ['platform', 'solution', 'web', 'app'];
const t = (id, extra) => ({ id, epic: 'E1', bucket: 'platform', category: 'Business Logic', title: id, deps: [], ...extra });

test('AC-001: order breaks ties by score (higher first, overriding the id tiebreak)', () => {
  const p = writeTmp({ buckets: B, tasks: [
    t('z_hi', { functionalValue: 5, nonFunctionalValue: 5, effort: 1 }),
    t('a_lo', { functionalValue: 1, effort: 1 }),
  ] });
  const { status, out } = runGraph('order', p);
  assert.equal(status, 0, out);
  assert.ok(idx(out, 'z_hi') < idx(out, 'a_lo'), `higher score first despite later id:\n${out}`);
});

test('AC-002: non-functional lens lifts an engineering-heavy task above a balanced one', () => {
  const p = writeTmp({ buckets: B, tasks: [
    t('a_y', { functionalValue: 2, nonFunctionalValue: 2, effort: 1 }),   // score 2
    t('z_x', { functionalValue: 1, nonFunctionalValue: 5, effort: 1 }),   // score 3
  ] });
  const { status, out } = runGraph('order', p);
  assert.equal(status, 0, out);
  assert.ok(idx(out, 'z_x') < idx(out, 'a_y'), `engineering-lens task should win:\n${out}`);
});

test('AC-003: effort is the denominator (bigger job defers)', () => {
  const p = writeTmp({ buckets: B, tasks: [
    t('z_p', { functionalValue: 5, effort: 1 }),   // 2.5
    t('a_q', { functionalValue: 5, effort: 5 }),   // 0.5
  ] });
  const { status, out } = runGraph('order', p);
  assert.equal(status, 0, out);
  assert.ok(idx(out, 'z_p') < idx(out, 'a_q'), out);
});

test('AC-004: a hard edge dominates the score (consumer never precedes producer)', () => {
  const p = writeTmp({ buckets: B, tasks: [
    t('z_h', { functionalValue: 5, nonFunctionalValue: 5, effort: 1, deps: ['a_l'] }), // high score
    t('a_l', { functionalValue: 1, effort: 5 }),                                        // low score
  ] });
  const { status, out } = runGraph('order', p);
  assert.equal(status, 0, out);
  assert.ok(idx(out, 'a_l') < idx(out, 'z_h'), `edge must beat score:\n${out}`);
});

test('AC-005: a low-value/high-effort task with no dependents floats last', () => {
  const p = writeTmp({ buckets: B, tasks: [
    t('d_defer', { functionalValue: 1, effort: 5 }),   // 0.1
    t('m1', { functionalValue: 5, effort: 1 }),        // 2.5
    t('m2', { functionalValue: 4, effort: 1 }),        // 2.0
  ] });
  const { status, out } = runGraph('order', p);
  assert.equal(status, 0, out);
  const lines = out.split('\n').filter((l) => /\bd_defer\b|\bm1\b|\bm2\b/.test(l));
  assert.ok(lines[lines.length - 1].includes('d_defer'), `deferred task should be last:\n${out}`);
});

test('AC-006: scoreOverride replaces the computed score', () => {
  const p = writeTmp({ buckets: B, tasks: [
    t('t_over', { functionalValue: 1, effort: 1, scoreOverride: 9, overrideReason: 'demo gate' }),
    t('u_hi', { functionalValue: 5, nonFunctionalValue: 5, effort: 1 }),  // computed 5
  ] });
  const { status, out } = runGraph('order', p);
  assert.equal(status, 0, out);
  assert.ok(idx(out, 't_over') < idx(out, 'u_hi'), `override 9 should beat computed 5:\n${out}`);
});

test('AC-006: scoreOverride without overrideReason exits 1 (all commands)', () => {
  const p = writeTmp({ buckets: B, tasks: [t('bad', { scoreOverride: 9 })] });
  assert.equal(runGraph('order', p).status, 1);
  assert.equal(runGraph('analyze', p).status, 1, 'load-time validation applies to analyze too');
});

test('AC-006: explicit effort <= 0 exits 1 (no Infinity tyrant)', () => {
  const p = writeTmp({ buckets: B, tasks: [t('z', { functionalValue: 1, effort: 0 })] });
  assert.equal(runGraph('order', p).status, 1);
});

test('AC-006: weights summing to <= 0 exits 1 (no NaN)', () => {
  const p = writeTmp({ buckets: B, weights: { functional: 0, nonFunctional: 0 }, tasks: [t('z', { functionalValue: 1, effort: 1 })] });
  assert.equal(runGraph('order', p).status, 1);
});

test('AC-007: no score fields anywhere -> order has no score annotation, exit 0', () => {
  const { status, out } = runGraph('order', join(fixturesDir, 'legacy-3task.json'));
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /score=/, `legacy order must not carry the score annotation:\n${out}`);
});

test('AC-008: custom weights change the combination', () => {
  const p = writeTmp({ buckets: B, weights: { functional: 3, nonFunctional: 1 }, tasks: [
    t('z_x', { functionalValue: 4, nonFunctionalValue: 0, effort: 1 }),   // (3*4+1*0)/4 = 3
    t('a_y', { functionalValue: 0, nonFunctionalValue: 4, effort: 1 }),   // (3*0+1*4)/4 = 1
  ] });
  const { status, out } = runGraph('order', p);
  assert.equal(status, 0, out);
  assert.ok(idx(out, 'z_x') < idx(out, 'a_y'), `functional-heavy weights should lift z_x:\n${out}`);
});
