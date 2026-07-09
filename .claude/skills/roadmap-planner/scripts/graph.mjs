#!/usr/bin/env node
// roadmap-planner — deterministic dependency-graph pass for Step 8 (order/cycles) and Step 10 (compaction).
// The model supplies judgment (what depends on what); this script supplies proof (topo-sort, cycle
// detection, ordering-violation flags, merge candidates). No external dependencies.
//
// Two edge types:
//   - `deps`     — HARD: consumer cannot function without producer. `dep -> task` = dep ships first.
//   - `seamDeps` — SOFT (seam): consumer should be preceded by an inherited-default concern
//                  (e.g. security/audit/tenancy/observability). `seam -> consumer`.
// Hard edges drive correctness (DFS cycle detection, exit 2). Soft edges float seams early over the
// COMBINED graph; a soft edge that would close a cycle is RELAXED (dropped) + reported (advisory,
// exit unchanged) — soft edges never gridlock. A soft edge whose seam is scheduled at/after its
// consumer (order present) is a SEAM-AFTER-CONSUMER blocker (exit 3).
//
// Usage:
//   node graph.mjs analyze <tasks.json>   # cycles + producer/seam-after-consumer violations
//   node graph.mjs order   <tasks.json>   # one valid order (seams float early)
//   node graph.mjs compact <tasks.json>   # Step-10 merge candidates (soft-linked pairs excluded)
//
// tasks.json shape (see references/graph-schema.md):
//   { "buckets": ["platform","solution","web","app"],
//     "tasks": [ { "id","epic","bucket","category","title","deps":[ids],"seamDeps":[ids]?,"order":<int?> }, ... ] }
// `order` is optional; supply it (a task's position in an EXISTING roadmap) to check that roadmap's order.
// A tasks.json with no `seamDeps` anywhere is byte-identical to the pre-seam tool.

import { readFileSync } from 'node:fs';

function die(msg, code = 1) { console.error(msg); process.exit(code); }

function load(path) {
  if (!path) die('usage: graph.mjs <analyze|order|compact> <tasks.json>');
  let raw;
  try { raw = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { die(`cannot read/parse ${path}: ${e.message}`); }
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : die('tasks.json must have a "tasks" array');
  const buckets = Array.isArray(raw.buckets) ? raw.buckets : ['platform', 'solution', 'web', 'app'];
  const weightsGiven = !!(raw.weights && typeof raw.weights === 'object');
  const weights = weightsGiven
    ? { functional: Number.isFinite(raw.weights.functional) ? raw.weights.functional : 1,
        nonFunctional: Number.isFinite(raw.weights.nonFunctional) ? raw.weights.nonFunctional : 1 }
    : { functional: 1, nonFunctional: 1 };
  const byId = new Map();
  for (const t of tasks) {
    if (!t.id) die(`every task needs an "id": ${JSON.stringify(t).slice(0, 80)}`);
    if (byId.has(t.id)) die(`duplicate task id: ${t.id}`);
    byId.set(t.id, t);
  }
  const dangling = [];
  for (const t of tasks) {
    for (const d of t.deps || []) if (!byId.has(d)) dangling.push({ task: t.id, missingDep: d });
    for (const s of t.seamDeps || []) if (!byId.has(s)) dangling.push({ task: t.id, missingDep: s });
  }
  // Score input validation (load-time, pre-dispatch, all commands — like the dangling check).
  const scoreErrors = [];
  for (const t of tasks) {
    if (t.scoreOverride !== undefined && !(typeof t.overrideReason === 'string' && t.overrideReason.trim()))
      scoreErrors.push(`"${t.id}": scoreOverride requires a non-empty overrideReason`);
    if (t.effort !== undefined && !(Number.isFinite(t.effort) && t.effort > 0))
      scoreErrors.push(`"${t.id}": effort must be a number > 0 (got ${JSON.stringify(t.effort)})`);
  }
  if (weightsGiven && !(weights.functional + weights.nonFunctional > 0))
    scoreErrors.push(`weights must sum to > 0 (got ${weights.functional} + ${weights.nonFunctional})`);
  return { tasks, buckets, weights, weightsGiven, byId, dangling, scoreErrors };
}

function edges(tasks, byId) {
  const adj = new Map(tasks.map(t => [t.id, []]));       // prerequisite -> [dependents]
  const indeg = new Map(tasks.map(t => [t.id, 0]));
  for (const t of tasks) for (const d of t.deps || []) {
    if (!byId.has(d)) continue;
    adj.get(d).push(t.id);
    indeg.set(t.id, indeg.get(t.id) + 1);
  }
  return { adj, indeg };
}

function hasSeams(tasks) { return tasks.some(t => (t.seamDeps || []).length > 0); }

const SCORE_FIELDS = ['functionalValue', 'nonFunctionalValue', 'effort', 'scoreOverride', 'overrideReason'];
function hasScores(tasks, weightsGiven) {
  return weightsGiven || tasks.some(t => SCORE_FIELDS.some(f => t[f] !== undefined));
}

// Pure WSJF-style priority: weightedAverage(functionalValue, nonFunctionalValue) / effort.
// A human `scoreOverride` (judgment call) replaces the computed value. No mutation of the task.
function computeScore(task, weights) {
  if (Number.isFinite(task.scoreOverride)) return task.scoreOverride;
  const fv = Number.isFinite(task.functionalValue) ? task.functionalValue : 0;
  const nfv = Number.isFinite(task.nonFunctionalValue) ? task.nonFunctionalValue : 0;
  const eff = Number.isFinite(task.effort) ? task.effort : 1;
  const wsum = weights.functional + weights.nonFunctional;
  return ((weights.functional * fv + weights.nonFunctional * nfv) / wsum) / eff;
}

// Raw seam edges `seam -> consumer` (from each task's seamDeps), deterministic order.
function seamEdges(tasks, byId) {
  const list = [];
  for (const t of tasks) for (const s of t.seamDeps || []) {
    if (byId.has(s)) list.push({ seam: s, consumer: t.id });
  }
  list.sort((a, b) => (a.seam < b.seam ? -1 : a.seam > b.seam ? 1 : a.consumer < b.consumer ? -1 : a.consumer > b.consumer ? 1 : 0));
  return list;
}

function reachableIn(adj, from) {
  const seen = new Set(); const q = [from];
  while (q.length) { const u = q.shift(); for (const v of adj.get(u) || []) if (!seen.has(v)) { seen.add(v); q.push(v); } }
  return seen; // strict descendants of `from`
}

// Purity invariant: CLONE the hard graph, never mutate it. Admit each seam edge only if the consumer
// cannot already reach the seam in the graph built SO FAR (hard + already-admitted seams); else relax.
function admitSoftEdges(hard, seamList) {
  const adj = new Map(); for (const [k, v] of hard.adj) adj.set(k, v.slice());
  const indeg = new Map(hard.indeg);
  const relaxations = [], admitted = [];
  for (const { seam, consumer } of seamList) {
    if (reachableIn(adj, consumer).has(seam)) {
      relaxations.push({ seam, consumer, reason: `${consumer} already precedes ${seam}` });
    } else {
      adj.get(seam).push(consumer);
      indeg.set(consumer, indeg.get(consumer) + 1);
      admitted.push({ seam, consumer });
    }
  }
  return { adj, indeg, relaxations, admitted };
}

function findCycles(tasks, adj) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(tasks.map(t => [t.id, WHITE]));
  const cycles = [];
  const stack = [];
  const visit = (u) => {
    color.set(u, GRAY); stack.push(u);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GRAY) { const i = stack.indexOf(v); cycles.push(stack.slice(i).concat(v)); }
      else if (color.get(v) === WHITE) visit(v);
    }
    stack.pop(); color.set(u, BLACK);
  };
  for (const t of tasks) if (color.get(t.id) === WHITE) visit(t.id);
  return cycles;
}

function bucketRank(buckets) { const m = new Map(); buckets.forEach((b, i) => m.set(b, i)); return m; }

function topoOrder(tasks, byId, adj, indeg, buckets, scoreMap = null) {
  const rank = bucketRank(buckets);
  const key = (id) => {
    const t = byId.get(id);
    const r = rank.has(t.bucket) ? rank.get(t.bucket) : 99;
    return [r, t.epic || '', id];
  };
  const cmp = (a, b) => {
    if (scoreMap) {
      const sa = scoreMap.get(a), sb = scoreMap.get(b);
      if (sa !== sb) return sb - sa;  // higher score first — tiebreak WITHIN the ready set only
    }
    const ka = key(a), kb = key(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] < kb[1] ? -1 : 1;
    return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0;
  };
  const indegC = new Map(indeg);
  const ready = tasks.filter(t => indegC.get(t.id) === 0).map(t => t.id);
  const out = [];
  while (ready.length) {
    ready.sort(cmp);
    const u = ready.shift();
    out.push(u);
    for (const v of adj.get(u) || []) {
      indegC.set(v, indegC.get(v) - 1);
      if (indegC.get(v) === 0) ready.push(v);
    }
  }
  return out; // shorter than tasks.length ⇒ a cycle remains
}

function orderViolations(tasks, byId, admitted = []) {
  // Only meaningful when the roadmap supplies numeric `order`. A prerequisite must have a strictly
  // smaller order (hard producer-after-consumer). An ADMITTED seam scheduled at/after its consumer is
  // a seam-after-consumer blocker (relaxed seams are skipped — the consumer legitimately precedes).
  const withOrder = tasks.filter(t => Number.isFinite(t.order));
  if (withOrder.length === 0) return { checked: false, violations: [] };
  const violations = [];
  for (const t of tasks) {
    if (!Number.isFinite(t.order)) continue;
    for (const d of t.deps || []) {
      const dep = byId.get(d);
      if (!dep || !Number.isFinite(dep.order)) continue;
      if (dep.order >= t.order) {
        violations.push({
          kind: 'producer-after-consumer',
          task: t.id, taskTitle: t.title, taskOrder: t.order,
          prerequisite: d, prerequisiteTitle: dep.title, prerequisiteOrder: dep.order,
          detail: `"${t.id}" (order ${t.order}) is scheduled at/before its prerequisite "${d}" (order ${dep.order}) — producer-after-consumer`,
        });
      }
    }
  }
  for (const { seam, consumer } of admitted) {
    const s = byId.get(seam), c = byId.get(consumer);
    if (!s || !c || !Number.isFinite(s.order) || !Number.isFinite(c.order)) continue;
    if (s.order >= c.order) {
      violations.push({
        kind: 'seam-after-consumer',
        task: consumer, taskTitle: c.title, taskOrder: c.order,
        prerequisite: seam, prerequisiteTitle: s.title, prerequisiteOrder: s.order,
        detail: `seam "${seam}" (order ${s.order}) is scheduled at/after its consumer "${consumer}" (order ${c.order}) — seam-after-consumer`,
      });
    }
  }
  return { checked: true, violations };
}

function reachable(from, adj) { return reachableIn(adj, from); }

function softPairKey(a, b) { return a < b ? `${a} ${b}` : `${b} ${a}`; }

function compactCandidates(tasks, byId, adj, softPairs) {
  const chain = [];    // A -> B where B's sole dep is A, same epic+bucket ⇒ collapse
  const parallel = []; // same epic+bucket+category, identical deps, independent ⇒ one slice
  const dependents = new Map(tasks.map(t => [t.id, (adj.get(t.id) || []).slice()]));
  for (const b of tasks) {
    const deps = b.deps || [];
    if (deps.length === 1) {
      const a = byId.get(deps[0]);
      if (a && a.epic === b.epic && a.bucket === b.bucket && (dependents.get(a.id) || []).length === 1
        && !softPairs.has(softPairKey(a.id, b.id))) {
        chain.push({ merge: [a.id, b.id], reason: `chain: "${b.id}" depends only on "${a.id}" (same ${a.bucket}/${a.epic}), and "${a.id}" has no other dependent — collapsible into one slice` });
      }
    }
  }
  const groups = new Map();
  for (const t of tasks) {
    const g = `${t.epic}|${t.bucket}|${t.category}|${JSON.stringify((t.deps || []).slice().sort())}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    // independent iff neither reaches the other AND no soft edge links them
    const ids = members.map(m => m.id);
    let independent = true;
    for (const m of members) { const desc = reachable(m.id, adj); for (const other of ids) if (other !== m.id && desc.has(other)) independent = false; }
    for (let i = 0; i < ids.length && independent; i++) for (let j = i + 1; j < ids.length; j++) if (softPairs.has(softPairKey(ids[i], ids[j]))) independent = false;
    if (independent) parallel.push({ merge: ids, reason: `parallel: ${ids.length} tasks in the same ${members[0].bucket}/${members[0].epic}/${members[0].category} with identical deps and no dependency between them — mergeable into one slice` });
  }
  return { chain, parallel };
}

function main() {
  const [cmd, path] = process.argv.slice(2);
  const { tasks, buckets, weights, weightsGiven, byId, dangling, scoreErrors } = load(path);
  const { adj, indeg } = edges(tasks, byId);
  const seams = hasSeams(tasks);

  if (dangling.length) {
    console.error('DANGLING DEPENDENCIES (dep id not found among tasks):');
    for (const d of dangling) console.error(`  - "${d.task}" depends on missing "${d.missingDep}"`);
    process.exit(1);
  }

  if (scoreErrors.length) {
    console.error('SCORE INPUT ERRORS:');
    for (const e of scoreErrors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // Soft-edge admission (only when seams exist — preserves byte-identity otherwise).
  const soft = seams ? admitSoftEdges({ adj, indeg }, seamEdges(tasks, byId)) : null;
  const softPairs = new Set();
  if (seams) for (const t of tasks) for (const s of t.seamDeps || []) softPairs.add(softPairKey(t.id, s));

  if (cmd === 'analyze') {
    const cycles = findCycles(tasks, adj);
    const { checked, violations } = orderViolations(tasks, byId, soft ? soft.admitted : []);
    if (cycles.length) {
      console.log('CYCLES (must break by splitting both tasks — Step 8, recursive):');
      for (const c of cycles) console.log(`  - ${c.join(' -> ')}`);
    } else console.log('no cycles — graph is acyclic ✓');
    if (seams && soft.relaxations.length) {
      console.log('\nRELAXED SEAM EDGES (advisory — a hard edge forbids scheduling the seam early):');
      for (const r of soft.relaxations) console.log(`  - seam "${r.seam}" -> "${r.consumer}" relaxed: ${r.reason}`);
    }
    if (checked) {
      if (violations.length) {
        console.log('\nORDERING VIOLATIONS (producer/seam scheduled after consumer):');
        for (const v of violations) console.log(`  - ${v.detail}`);
      } else console.log('no ordering violations vs the supplied roadmap order ✓');
    } else console.log('(no numeric "order" on tasks — skipped roadmap-order check; supply order to validate an existing roadmap)');
    const summary = { tasks: tasks.length, cycles: cycles.length, orderChecked: checked, orderViolations: violations.length };
    const payload = { summary, cycles, violations };
    if (seams) { summary.relaxations = soft.relaxations.length; payload.relaxations = soft.relaxations; }
    console.log('\n' + JSON.stringify(payload));
    process.exit(cycles.length ? 2 : violations.length ? 3 : 0);
  }

  if (cmd === 'order') {
    const oAdj = seams ? soft.adj : adj;
    const oIndeg = seams ? soft.indeg : indeg;
    if (seams && soft.relaxations.length) {
      for (const r of soft.relaxations) console.log(`relaxed: seam "${r.seam}" -> "${r.consumer}" (${r.reason})`);
    }
    const scored = hasScores(tasks, weightsGiven);
    const scoreMap = scored ? new Map(tasks.map(t => [t.id, computeScore(t, weights)])) : null;
    const ord = topoOrder(tasks, byId, oAdj, oIndeg, buckets, scoreMap);
    if (ord.length < tasks.length) die(`cannot produce an order: a cycle remains (${ord.length}/${tasks.length} placed). Run "analyze" to see it.`, 2);
    ord.forEach((id, i) => {
      const t = byId.get(id);
      let line = `${String(i + 1).padStart(3)}  [${t.bucket}/${t.epic}] ${id} — ${t.title}`;
      if (scored) {
        line += `  score=${Number(scoreMap.get(id).toFixed(3))}`;
        if (Number.isFinite(t.scoreOverride)) line += `  override:${t.overrideReason}`;
      }
      console.log(line);
    });
    process.exit(0);
  }

  if (cmd === 'compact') {
    const { chain, parallel } = compactCandidates(tasks, byId, adj, softPairs);
    if (!chain.length && !parallel.length) console.log('no compaction candidates found');
    for (const c of [...chain, ...parallel]) console.log(`  - merge {${c.merge.join(', ')}}: ${c.reason}`);
    console.log('\n' + JSON.stringify({ chain, parallel }));
    process.exit(0);
  }

  die('usage: graph.mjs <analyze|order|compact> <tasks.json>');
}

main();
