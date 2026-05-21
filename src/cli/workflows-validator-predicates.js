// Foundation — v1 predicate vocabulary for workflows.jsonl Track preconditions
// and selector-node alternate preconditions. The set is closed; unknown
// predicates fail Article IV invariant I11 at validate time. Adding a new
// predicate is a constitutional change (seed.md §18.4 + this module + the
// CLAUDE.md Article IV invariant list).

export const V1_PREDICATES = Object.freeze(
  new Set([
    'requires_git',
    'requires_user_override',
    'requires_min_components',
    'requires_phase_completed',
    'requires_skill_present',
  ])
);

export function isKnownPredicate(name) {
  return V1_PREDICATES.has(name);
}
