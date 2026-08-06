// Domain — apply a contribution as a set of typed operations against ids (D1).
//
// Rejection is ATOMIC and that is load-bearing, not a convenience: a contribution
// that writes its clean ops and drops its conflicting one leaves the corpus in a
// state no contributor intended and no reviewer approved. All-or-nothing keeps
// "the corpus reflects some contributor's whole intent" true at every instant.

import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { detectConflicts } from './conflicts.mjs';
import { anchorMatches } from './coverage.mjs';
import { stampElement } from './digest.mjs';
import { resolveRefs } from './refs.mjs';
import { ensureWorkspace, readAll, removeElement, writeElement } from './store.mjs';

const REMOVABLE = 'remove';

// Two roots, deliberately: the contribution WRITES to the corpus (specDir) but its
// `governed_by` / `rests_on` refs resolve against CANONICAL MEMORY (memDir). Passing
// specDir to resolveRefs finds no categories and marks every ref unresolved, which
// refuses valid contributions while looking like the guard working.
export function applyContribution({ specDir, memDir, slug, ops = [] } = {}) {
  assertSafeSlug(slug, 'workspace-contribution');

  const preflight = ensureWorkspace(specDir);
  if (!preflight.ready) return { written: [], conflicts: [], preflight };

  const { elements } = readAll(specDir);
  const conflicts = detectConflicts(elements, ops);
  if (conflicts.length) return { written: [], conflicts };

  // Every named decision/constraint key must resolve BEFORE anything is written
  // (spec §Behavior #1, epic D4). An element citing a key that names no entry
  // asserts a governing reason that does not exist, which is worse than carrying
  // none. Checked across the whole contribution so the refusal stays atomic.
  const unresolved = ops.flatMap((op) => resolveRefs(memDir, op.fields ?? {}).unresolved);
  if (unresolved.length) return { written: [], conflicts: [], unresolved };

  return { written: applyAll(specDir, elements, ops), conflicts: [] };
}

// Phase 10.5 folds the landed change back into the central spec so the model stays
// true to disk instead of drifting the moment the next cycle ships.
//
// Scoped to the anchors this landing actually TOUCHED. Re-stamping every element
// would make classify() permanently green and launder the drift the digest exists
// to catch — the decay-evasion shape this system has removed twice already
// (backfill D3; the retired "HEAD is permanently fresh" semantics). Anything a
// scanner cannot check comes back as a proposal for a human, never as a write.
export function syncBack({ specDir, memDir, rootDir = process.cwd(), slug, touchedPaths = [], nonDerivable = [] } = {}) {
  assertSafeSlug(slug, 'workspace-contribution');

  const preflight = ensureWorkspace(specDir);
  if (!preflight.ready) return { applied: [], proposed: [...nonDerivable], preflight };

  const { elements } = readAll(specDir);
  const touched = elements.filter(
    (element) => element.anchor && touchedPaths.some((path) => anchorMatches(element.anchor, path)),
  );

  const applied = [];
  for (const element of touched) {
    const result = stampElement(specDir, element.id, { rootDir });
    if (result.state !== 'dangling') applied.push(element.id);
  }

  return { applied, proposed: [...nonDerivable] };
}

function applyAll(specDir, elements, ops) {
  const written = [];
  for (const op of ops) {
    // A remove used to `continue` here, so it reported success and deleted
    // nothing — detectConflicts validated the id existed and then the element
    // stayed on disk forever.
    if (op.verb === REMOVABLE) {
      removeElement(specDir, op.target_id);
      continue;
    }
    writeElement(specDir, mergedElement(elements, op));
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
