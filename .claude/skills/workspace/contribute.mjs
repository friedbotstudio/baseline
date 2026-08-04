// Domain — apply a contribution as a set of typed operations against ids (D1).
//
// Rejection is ATOMIC and that is load-bearing, not a convenience: a contribution
// that writes its clean ops and drops its conflicting one leaves the corpus in a
// state no contributor intended and no reviewer approved. All-or-nothing keeps
// "the corpus reflects some contributor's whole intent" true at every instant.

import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { detectConflicts } from './conflicts.mjs';
import { resolveRefs } from './refs.mjs';
import { ensureWorkspace, readAll, removeElement, writeElement } from './store.mjs';

const REMOVABLE = 'remove';

export function applyContribution({ memDir, slug, ops = [] } = {}) {
  assertSafeSlug(slug, 'workspace-contribution');

  const preflight = ensureWorkspace(memDir);
  if (!preflight.ready) return { written: [], conflicts: [], preflight };

  const { elements } = readAll(memDir);
  const conflicts = detectConflicts(elements, ops);
  if (conflicts.length) return { written: [], conflicts };

  // Every named decision/constraint key must resolve BEFORE anything is written
  // (spec §Behavior #1, epic D4). An element citing a key that names no entry
  // asserts a governing reason that does not exist, which is worse than carrying
  // none. Checked across the whole contribution so the refusal stays atomic.
  const unresolved = ops.flatMap((op) => resolveRefs(memDir, op.fields ?? {}).unresolved);
  if (unresolved.length) return { written: [], conflicts: [], unresolved };

  return { written: applyAll(memDir, elements, ops), conflicts: [] };
}

function applyAll(memDir, elements, ops) {
  const written = [];
  for (const op of ops) {
    // A remove used to `continue` here, so it reported success and deleted
    // nothing — detectConflicts validated the id existed and then the element
    // stayed on disk forever.
    if (op.verb === REMOVABLE) {
      removeElement(memDir, op.target_id);
      continue;
    }
    writeElement(memDir, mergedElement(elements, op));
    written.push(op.target_id);
  }
  return written;
}

// An update carries only the fields it changes; an add carries the whole element.
// Merging against the current entry makes re-applying an identical add a genuine
// no-op rather than a rewrite that drops unmentioned fields.
function mergedElement(elements, op) {
  const current = elements.find((el) => el.id === op.target_id) ?? {};
  return { ...current, ...op.fields, id: op.target_id };
}
