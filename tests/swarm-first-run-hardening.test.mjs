// swarm-mode first-run hardening (-e3f2): D1/D2/D4/D5/D7 safeguards.
// Pure exported cores are unit-tested directly; the swarm-plan validator is
// exercised through its CLI (spawnSync) since the `execution` field is enforced
// at the schema boundary. RED until the implement-tick lands the helpers.
//
// AC traceability (spec docs/specs/swarm-first-run-hardening.md):
//   AC-001 D1 worktree-safety · AC-002 D2 auditWave · AC-003 D4 parseWorkerResult
//   AC-004 D5 validate.execution · AC-005 D7 checkApiSurfacePinned
//   AC-006 — this file IS the AC-006 evidence: every safeguard has >=1 unit test
//           and the suite is green at /integrate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertWorktreeWaveSafety } from '../.claude/skills/swarm-dispatch/worktree-safety.mjs';
import { auditWave } from '../.claude/skills/swarm-dispatch/swarm_wave_audit.mjs';
import { parseWorkerResult } from '../.claude/skills/swarm-dispatch/parse_worker_result.mjs';
import { checkApiSurfacePinned } from '../.claude/skills/spec-lint/lint.mjs';

// ── D1 — worktree-safety ────────────────────────────────────────────────────

test('D1: single-wave worktree with matching base → ok', () => {
  const r = assertWorktreeWaveSafety({ isolation: 'worktree', waves: [['T-001']], baselineRef: 'abc', worktreeBase: 'abc' });
  assert.equal(r.ok, true);
});

test('D1: multi-wave under worktree → refused, reason names multi-wave', () => {
  const r = assertWorktreeWaveSafety({ isolation: 'worktree', waves: [['T-001'], ['T-002']], baselineRef: 'abc', worktreeBase: 'abc' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /multi-?wave/i);
});

test('D1: baseline_ref != worktree base → refused, reason names mismatch; shared isolation always ok', () => {
  const mism = assertWorktreeWaveSafety({ isolation: 'worktree', waves: [['T-001']], baselineRef: 'abc', worktreeBase: 'def' });
  assert.equal(mism.ok, false);
  assert.match(mism.reason, /baseline|merge-base|mismatch/i);
  // shared mode is never constrained by worktree-base or wave count
  const shared = assertWorktreeWaveSafety({ isolation: 'shared', waves: [['T-001'], ['T-002'], ['T-003']], baselineRef: 'abc', worktreeBase: 'def' });
  assert.equal(shared.ok, true);
});

// ── D2 — swarm_wave_audit.auditWave ─────────────────────────────────────────

test('D2: all changes within union → clean', () => {
  const r = auditWave(['a.mjs', 'b.mjs'], ['a.mjs', 'b.mjs', 'c.mjs']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

test('D2: change under .claude/skills/** outside union → violation', () => {
  const r = auditWave(['.claude/skills/x/y.mjs', 'a.mjs'], ['a.mjs']);
  assert.equal(r.ok, false);
  assert.ok(r.violations.includes('.claude/skills/x/y.mjs'));
});

test('D2: empty changed set → clean (vacuous)', () => {
  const r = auditWave([], ['a.mjs']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

// ── D4 — parse_worker_result.parseWorkerResult ──────────────────────────────

test('D4: valid trailing done line → complete', () => {
  const text = 'did the work\n{"task_id":"T-001","status":"done","files_touched":[],"note":"ok"}';
  const r = parseWorkerResult(text);
  assert.equal(r.complete, true);
  assert.equal(r.status, 'done');
  assert.equal(r.task_id, 'T-001');
});

test('D4: no JSON line at all → incomplete with reason', () => {
  const r = parseWorkerResult('Ready for implement.');
  assert.equal(r.complete, false);
  assert.equal(typeof r.reason, 'string');
  assert.ok(r.reason.length > 0);
});

test('D4: malformed JSON, trailing prose after JSON, and status:failed all → incomplete', () => {
  const malformed = parseWorkerResult('{task_id:T-001 status done');
  assert.equal(malformed.complete, false);

  const trailing = parseWorkerResult('{"task_id":"T-001","status":"done"}\nthanks, all set!');
  assert.equal(trailing.complete, false);
  assert.match(trailing.reason, /trailing|final|last/i);

  const failed = parseWorkerResult('{"task_id":"T-001","status":"failed","note":"red"}');
  assert.equal(failed.complete, false);
  assert.equal(failed.status, 'failed');
});

// ── D5 — validate.mjs execution field (via CLI) ─────────────────────────────

function runValidate(plan) {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-plan-'));
  const planPath = join(dir, 'plan.json');
  const specPath = join(dir, 'spec.md');
  writeFileSync(specPath, '# dummy spec\n');
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  const res = spawnSync('node', ['.claude/skills/swarm-plan/validate.mjs', specPath, planPath], { encoding: 'utf8' });
  let rewritten = null;
  try { rewritten = JSON.parse(readFileSync(planPath, 'utf8')); } catch {}
  rmSync(dir, { recursive: true, force: true });
  return { ...res, rewritten };
}

const baseTask = (over) => ({
  id: 'T-001', title: 't', component: 'c', acs: ['AC-001'],
  write_set: ['a.mjs'], depends_on: [], execution: 'worker-safe', ...over,
});

test('D5: task missing execution → schema fail naming the field', () => {
  const t = baseTask();
  delete t.execution;
  const r = runValidate({ slug: 's', spec: 'spec.md', tasks: [t] });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /execution/);
});

test('D5: execution outside the enum → schema fail naming execution', () => {
  const r = runValidate({ slug: 's', spec: 'spec.md', tasks: [baseTask({ execution: 'banana' })] });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /execution/);
});

test('D5: valid execution values → exit 0 with waves assigned', () => {
  const plan = {
    slug: 's', spec: 'spec.md', tasks: [
      baseTask({ id: 'T-001', write_set: ['a.mjs'], execution: 'worker-safe' }),
      baseTask({ id: 'T-002', write_set: ['b.mjs'], execution: 'needs-main-context' }),
    ],
  };
  const r = runValidate(plan);
  assert.equal(r.status, 0);
  assert.ok(Array.isArray(r.rewritten.waves) && r.rewritten.waves.length >= 1);
});

test('D5 regression: adding execution does not change wave assignment for disjoint independent tasks', () => {
  const plan = {
    slug: 's', spec: 'spec.md', tasks: [
      baseTask({ id: 'T-001', write_set: ['a.mjs'], depends_on: [], execution: 'worker-safe' }),
      baseTask({ id: 'T-002', write_set: ['b.mjs'], depends_on: [], execution: 'worker-safe' }),
    ],
  };
  const r = runValidate(plan);
  assert.equal(r.status, 0);
  const ids = r.rewritten.waves.flat().sort();
  assert.deepEqual(ids, ['T-001', 'T-002']);
});

// ── D7 — checkApiSurfacePinned ──────────────────────────────────────────────

const swarmBoundSpecEmptyContracts = `
Component(a, "A", "t", "r")
Component(b, "B", "t", "r")
Component(c, "C", "t", "r")

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
`;

const smallSpecEmptyContracts = `
Component(a, "A", "t", "r")

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
`;

test('D7: swarm-bound spec with empty Contracts → ADVISORY', () => {
  const r = checkApiSurfacePinned(swarmBoundSpecEmptyContracts, 3);
  assert.equal(r.ok, false);
  assert.match(r.reason, /contract|api surface|pin/i);
});

test('D7: small spec (components < min) with empty Contracts → ok (no false advisory)', () => {
  const r = checkApiSurfacePinned(smallSpecEmptyContracts, 3);
  assert.equal(r.ok, true);
});
