// replan (Foundation) — applyReplan: the replan-RECORD primitive (AC-003).
//
// Records a single replan as a new append-only version on the plan. It does NOT
// decide whether to replan — that policy (oscillation, dry-round, ceiling-below-
// floor, arbitration) is -4c43. This primitive validates the change it is told to
// make, applies it to a clone of the current snapshot, validates the resulting
// plan, and records it via plan-store.recordRevision (append-only). An invalid
// change throws and records nothing.

import { currentSnapshot, recordRevision, validatePlan } from './plan-store.mjs';

const OPS = new Set(['update-assignment', 'add-node', 'remove-node', 'set-status', 'set-result']);
const STATUSES = new Set(['pending', 'in_progress', 'done', 'failed']);

function requireNodeIndex(tasklist, nodeId) {
  const i = tasklist.findIndex((n) => n.id === nodeId);
  if (i === -1) {
    throw new Error(`replan: unknown nodeId "${nodeId}" — not found in the current snapshot`);
  }
  return i;
}

// Mutates the (already-cloned) snapshot in place and returns it.
function applyOp(snapshot, change) {
  const { tasklist } = snapshot;
  switch (change.op) {
    case 'update-assignment': {
      const i = requireNodeIndex(tasklist, change.nodeId);
      tasklist[i] = { ...tasklist[i], assignment: change.assignment };
      break;
    }
    case 'add-node': {
      if (!change.node || typeof change.node.id !== 'string') {
        throw new Error('replan: add-node requires a `node` object with a string `id`');
      }
      tasklist.push(change.node);
      break;
    }
    case 'remove-node': {
      const i = requireNodeIndex(tasklist, change.nodeId);
      tasklist.splice(i, 1);
      break;
    }
    case 'set-status': {
      const i = requireNodeIndex(tasklist, change.nodeId);
      if (!STATUSES.has(change.status)) {
        throw new Error(`replan: set-status invalid status "${change.status}" — one of ${[...STATUSES].join(', ')}`);
      }
      tasklist[i] = { ...tasklist[i], status: change.status };
      break;
    }
    case 'set-result': {
      const i = requireNodeIndex(tasklist, change.nodeId);
      tasklist[i] = { ...tasklist[i], result: change.result };
      break;
    }
  }
  return snapshot;
}

/**
 * Record a single replan as a new version. Returns the updated plan (append-only;
 * the caller's plan object is not mutated). Throws — recording nothing — when the
 * change is malformed, targets a missing node, or would produce an invalid plan.
 */
export async function applyReplan(plan, change, meta = {}) {
  if (!change || typeof change !== 'object' || !OPS.has(change.op)) {
    throw new Error(`replan: unknown op "${change && change.op}" — supported ops: ${[...OPS].join(', ')}`);
  }

  // Apply to a clone so the caller's current snapshot is never mutated.
  const nextSnapshot = applyOp(structuredClone(currentSnapshot(plan)), change);

  // Validate the CANDIDATE plan before recording — an invalid replan must not append a version.
  const lastV = plan.versions[plan.versions.length - 1].v;
  const candidate = {
    ...plan,
    versions: [
      ...plan.versions,
      { v: lastV + 1, ts: meta.ts, author: meta.author, reason: meta.reason, snapshot: nextSnapshot },
    ],
  };
  const { ok, errors } = validatePlan(candidate);
  if (!ok) {
    throw new Error(`replan: change produced an invalid plan: ${errors.join('; ')}`);
  }

  const reason = meta.reason ?? `replan: ${change.op}${change.nodeId ? ` ${change.nodeId}` : ''}`;
  return recordRevision(plan, nextSnapshot, { author: meta.author, reason, ts: meta.ts });
}
