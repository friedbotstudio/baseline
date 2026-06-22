// plan-frame (Foundation) — per-node frame extraction from a versioned plan object.
// A worker reads only its own node frame, never the full plan history or sibling assignments.
// Design invariant (AC-004): JSON.stringify(readFrame(plan, id)).length < JSON.stringify(plan).length

import { currentSnapshot } from './plan-store.mjs';

function findNode(tasklist, nodeId) {
  const node = tasklist.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(
      `plan-frame: node "${nodeId}" not found in current snapshot (known ids: ${tasklist.map((n) => n.id).join(', ')})`
    );
  }
  return node;
}

function buildDepsResults(tasklist, deps) {
  return deps.map((depId) => {
    const depNode = tasklist.find((n) => n.id === depId);
    return { id: depId, result: depNode ? (depNode.result ?? null) : null };
  });
}

export function readFrame(plan, nodeId) {
  const snapshot = currentSnapshot(plan);
  const { goal, tasklist } = snapshot;
  const node = findNode(tasklist, nodeId);
  const deps = node.assignment.deps ?? [];
  return {
    goal,
    assignment: node.assignment,
    deps_results: buildDepsResults(tasklist, deps),
  };
}
