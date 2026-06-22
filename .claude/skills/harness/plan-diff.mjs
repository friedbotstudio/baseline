// plan-diff (Foundation) — pure structural diff between two plan version snapshots.
// No filesystem I/O; no side effects. stdlib only.

import { getVersion } from './plan-store.mjs';

function nodeIndex(tasklist) {
  const index = new Map();
  for (const node of tasklist) index.set(node.id, node);
  return index;
}

function stableJson(value) {
  return JSON.stringify(value);
}

function goalDiff(fromSnap, toSnap) {
  return fromSnap.goal === toSnap.goal ? null : { from: fromSnap.goal, to: toSnap.goal };
}

function nodeSets(fromSnap, toSnap) {
  const fromIndex = nodeIndex(fromSnap.tasklist);
  const toIndex = nodeIndex(toSnap.tasklist);

  const added = [];
  const removed = [];
  const changed = [];

  for (const [id] of toIndex) {
    if (!fromIndex.has(id)) added.push(id);
  }

  for (const [id, fromNode] of fromIndex) {
    if (!toIndex.has(id)) {
      removed.push(id);
    } else if (stableJson(fromNode) !== stableJson(toIndex.get(id))) {
      changed.push(id);
    }
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
  };
}

export function diffVersions(plan, a, b) {
  const fromSnap = getVersion(plan, a);
  const toSnap = getVersion(plan, b);

  const { added, removed, changed } = nodeSets(fromSnap, toSnap);

  return {
    goal_changed: goalDiff(fromSnap, toSnap),
    added,
    removed,
    changed,
  };
}
