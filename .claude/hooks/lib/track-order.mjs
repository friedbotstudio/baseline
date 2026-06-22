// track-order (hooks/lib) — pure phase-ordering predicates for track_guard.
// Extracted so the ordering logic is unit-testable without executing the hook's
// top-level payload read (importing track_guard.mjs would run the hook).

// Whether a phase counts as satisfied given the set of completed phases.
//
// The swarm path (swarm-plan → approve-swarm → swarm-dispatch) IS Phase 6 — the
// same ordering slot as the solo `tdd` phase (CLAUDE.md Article IV 6a/6b/6c). `tdd`
// carries no artifact glob, so its prereq resolves by completed-membership, and a
// swarm build records `swarm-dispatch`, never a literal `tdd`. So a completed
// `swarm-dispatch` satisfies any prereq on `tdd`. The equivalence is tdd-ONLY: no
// other phase gains it, so ordering enforcement everywhere else is unchanged.
export function phaseSatisfied(ph, completed) {
  if (completed.has(ph)) return true;
  if (ph === 'tdd' && completed.has('swarm-dispatch')) return true;
  return false;
}
