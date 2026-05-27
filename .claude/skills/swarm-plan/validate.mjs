#!/usr/bin/env node
// Covers AC-003 of remove-python-runtime-dep.
// swarm-plan validator — verifies a draft plan and assigns waves deterministically.
//
// Usage: validate.mjs <spec-path> <plan-path>
//
// Reads plan-path (JSON), performs:
//   - schema check: required fields on every task
//   - reference check: depends_on ids all resolve to tasks in the plan
//   - acyclicity: DAG has no cycles (Kahn's algorithm)
//   - wave assignment: topological sort with pairwise-disjoint write_set constraint
//
// On success, rewrites plan-path with `waves` populated. Exit 0.
// On failure, prints the precise violation to stderr and exits non-zero.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

function fail(msg) { process.stderr.write(`validate: ${msg}\n`); }

function loadPlan(planPath) {
  try {
    return JSON.parse(readFileSync(planPath, 'utf8'));
  } catch (e) {
    fail(`plan is not valid JSON: ${e.message}`);
    process.exit(1);
  }
}

function validateSchema(plan) {
  const errs = [];
  for (const k of ['slug', 'spec', 'tasks']) {
    if (!(k in plan)) errs.push(`missing top-level field: ${k}`);
  }
  const tasks = plan.tasks || [];
  if (!Array.isArray(tasks) || tasks.length === 0) {
    errs.push('tasks[] must be a non-empty array');
  }
  const REQ = ['id', 'title', 'component', 'acs', 'write_set', 'depends_on'];
  const ids = new Set();
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (typeof t !== 'object' || t === null || Array.isArray(t)) {
      errs.push(`task[${i}] is not an object`);
      continue;
    }
    const missing = REQ.filter(k => !(k in t));
    if (missing.length) {
      errs.push(`task[${i}] missing fields: ${JSON.stringify(missing.sort())}`);
      continue;
    }
    if (typeof t.id !== 'string' || !t.id) errs.push(`task[${i}].id must be a non-empty string`);
    if (ids.has(t.id)) errs.push(`duplicate task id: ${t.id}`);
    ids.add(t.id);
    for (const field of ['acs', 'write_set', 'depends_on']) {
      const v = t[field];
      if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) {
        errs.push(`task ${t.id ?? '?'}.${field} must be a list of strings`);
      }
    }
    if (Array.isArray(t.write_set) && t.write_set.length === 0) {
      errs.push(`task ${t.id}.write_set is empty — every task must declare at least one file`);
    }
  }
  return { errs, ids };
}

function validateRefs(tasks, ids) {
  const errs = [];
  for (const t of tasks) {
    for (const d of t.depends_on) {
      if (!ids.has(d)) errs.push(`task ${t.id}.depends_on references unknown id: ${d}`);
      if (d === t.id) errs.push(`task ${t.id} depends on itself`);
    }
  }
  return errs;
}

function detectCycle(tasks, ids) {
  const indeg = new Map();
  const outedges = new Map();
  for (const id of ids) { indeg.set(id, 0); outedges.set(id, []); }
  for (const t of tasks) {
    for (const d of t.depends_on) {
      outedges.get(d).push(t.id);
      indeg.set(t.id, indeg.get(t.id) + 1);
    }
  }
  const indegWork = new Map(indeg);
  const ready = [...ids].filter(id => indegWork.get(id) === 0).sort();
  let visited = 0;
  const readyWork = [...ready];
  while (readyWork.length) {
    const next = readyWork.shift();
    visited += 1;
    for (const n of [...outedges.get(next)].sort()) {
      indegWork.set(n, indegWork.get(n) - 1);
      if (indegWork.get(n) === 0) readyWork.push(n);
    }
    readyWork.sort();
  }
  if (visited !== tasks.length) {
    const unvisited = [...ids].filter(id => indegWork.get(id) > 0);
    return { hasCycle: true, unvisited, indeg, outedges };
  }
  return { hasCycle: false, indeg, outedges };
}

function assignWaves(tasks, ids, indeg, outedges) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const indeg2 = new Map(indeg);
  const remaining = new Set(ids);
  const waves = [];
  while (remaining.size > 0) {
    const candidates = [...remaining].filter(id => indeg2.get(id) === 0).sort();
    if (candidates.length === 0) {
      fail(`internal error — no candidates but tasks remain: ${[...remaining]}`);
      process.exit(1);
    }
    candidates.sort((a, b) => {
      const da = byId.get(a).write_set.length;
      const db = byId.get(b).write_set.length;
      if (da !== db) return db - da;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    let wave = [];
    let waveFiles = new Set();
    let overflow = [];
    for (const tid of candidates) {
      const files = new Set(byId.get(tid).write_set);
      const intersects = [...files].some(f => waveFiles.has(f));
      if (intersects) overflow.push(tid);
      else {
        wave.push(tid);
        for (const f of files) waveFiles.add(f);
      }
    }
    if (wave.length === 0) {
      wave = [candidates[0]];
      overflow = candidates.slice(1);
      waveFiles = new Set(byId.get(candidates[0]).write_set);
    }
    wave.sort();
    waves.push(wave);
    for (const tid of wave) remaining.delete(tid);
    for (const tid of wave) {
      for (const n of outedges.get(tid)) {
        indeg2.set(n, indeg2.get(n) - 1);
      }
    }
  }
  return waves;
}

function printSummary(tasks, waves) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  process.stdout.write(`validate: OK — ${tasks.length} task(s) in ${waves.length} wave(s).\n`);
  for (let i = 0; i < waves.length; i++) {
    process.stdout.write(`  wave ${i + 1}:\n`);
    for (const tid of waves[i]) {
      const t = byId.get(tid);
      const nfiles = t.write_set.length;
      const acs = t.acs.length ? t.acs.join(',') : '-';
      const deps = t.depends_on.length ? t.depends_on.join(',') : '-';
      process.stdout.write(`    ${tid}  ${t.component.padEnd(24)} [${acs}]  ${nfiles} file(s)  deps=${deps}\n`);
    }
  }
}

function main(argv) {
  if (argv.length < 2 || !argv[0] || !argv[1]) {
    process.stderr.write('usage: validate.mjs <spec-path> <plan-path>\n');
    process.exit(2);
  }
  const [, planPath] = argv;
  if (!existsSync(planPath)) {
    fail(`plan not found at ${planPath}`);
    process.exit(2);
  }

  const plan = loadPlan(planPath);

  const { errs: schemaErrs, ids } = validateSchema(plan);
  if (schemaErrs.length) {
    for (const e of schemaErrs) fail(e);
    process.exit(1);
  }

  const refErrs = validateRefs(plan.tasks, ids);
  if (refErrs.length) {
    for (const e of refErrs) fail(e);
    process.exit(1);
  }

  const { hasCycle, unvisited, indeg, outedges } = detectCycle(plan.tasks, ids);
  if (hasCycle) {
    fail(`dependency graph has a cycle among: ${JSON.stringify(unvisited)}`);
    process.exit(1);
  }

  const waves = assignWaves(plan.tasks, ids, indeg, outedges);
  plan.waves = waves;
  plan.status = 'planned';
  plan.validated_at = Math.floor(Date.now() / 1000);

  writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
  printSummary(plan.tasks, waves);
  process.exit(0);
}

main(process.argv.slice(2));
