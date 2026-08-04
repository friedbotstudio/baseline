// Domain — conflict DETECTION. Pure: no IO, no writes, no repair.
//
// Spec decision D2. Auto-merging two contributors' structural intent is exactly
// the semantic conflict textual git merge already commits happily; doing it
// silently in our own format would not be an improvement. So conflicts are
// reported and the contribution is rejected, in the same register as
// assertSafeFactKey and writeConstraint's UnregisteredCategoryError.

const MUTATING_VERBS = new Set(['update', 'remove']);

function conflict(kind, targetId, detail) {
  return { kind, target_id: targetId, detail };
}

// Identity is the declared id (D1). Two DIFFERENT ids claiming one anchor means
// two contributors described the same thing under different names — the case the
// epic named as undesigned. Same id re-declaring its own anchor is idempotent
// re-application, not a conflict.
function duplicateAnchor(existing, op) {
  const anchor = op.fields?.anchor;
  if (!anchor) return null;
  const clash = existing.find((el) => el.anchor === anchor && el.id !== op.target_id);
  return clash
    ? conflict('duplicate-anchor', op.target_id, `anchor ${anchor} already claimed by ${clash.id}`)
    : null;
}

// An update or remove naming an absent id is a contributor working from a stale
// picture. Silently no-op'ing it reports success for work that did not happen.
function unknownId(existing, op) {
  const known = existing.some((el) => el.id === op.target_id);
  return known ? null : conflict('unknown-id', op.target_id, `no element with id ${op.target_id}`);
}

export function detectConflicts(existing = [], ops = []) {
  const found = [];
  for (const op of ops) {
    const check = MUTATING_VERBS.has(op.verb) ? unknownId(existing, op) : duplicateAnchor(existing, op);
    if (check) found.push(check);
  }
  return found;
}
