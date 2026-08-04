// Domain — apply a contribution as a set of typed operations against ids (D1).
//
// Rejection is ATOMIC and that is load-bearing, not a convenience: a contribution
// that writes its clean ops and drops its conflicting one leaves the corpus in a
// state no contributor intended and no reviewer approved. All-or-nothing keeps
// "the corpus reflects some contributor's whole intent" true at every instant.

import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { detectConflicts } from './conflicts.mjs';
import { ensureWorkspace, readAll, writeElement } from './store.mjs';

const REMOVABLE = 'remove';

export function applyContribution({ memDir, slug, ops = [] } = {}) {
  assertSafeSlug(slug, 'workspace-contribution');

  const preflight = ensureWorkspace(memDir);
  if (!preflight.ready) return { written: [], conflicts: [], preflight };

  const { elements } = readAll(memDir);
  const conflicts = detectConflicts(elements, ops);
  if (conflicts.length) return { written: [], conflicts };

  return { written: applyAll(memDir, elements, ops), conflicts: [] };
}

function applyAll(memDir, elements, ops) {
  const written = [];
  for (const op of ops) {
    if (op.verb === REMOVABLE) continue;
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
