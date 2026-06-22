# Security reports — swarm-d3d6-hardening

## swarm-d3d6-hardening-2026-06-22.md

# Security Review — swarm-d3d6-hardening — 2026-06-22

## Summary

Overall risk: **LOW**. The diff is a phase-ordering correctness fix plus prose. The
load-bearing question for a `track_guard` change is whether it **weakens enforcement or
opens a bypass** — it does not. No network surface, no untrusted input, no new dependency.

Checked: A01 (broken access control / ordering bypass — finding-class below), A04
(insecure design), A03 (injection — n/a, pure Set membership). Secrets: clean.

## Findings

### [INFORMATIONAL] track_guard now treats `swarm-dispatch` as satisfying the `tdd` slot — no enforcement weakening

- **OWASP**: A01 (Broken Access Control — evaluated, not violated) | **CWE**: n/a
- **File**: `.claude/hooks/lib/track-order.mjs:18-22`, `.claude/hooks/track_guard.mjs:126`
- **Evidence**:
  ```js
  export function phaseSatisfied(ph, completed) {
    if (completed.has(ph)) return true;
    if (ph === 'tdd' && completed.has('swarm-dispatch')) return true;
    return false;
  }
  ```
- **Analysis**: The new equivalence only fires when `swarm-dispatch` is already in
  `completed[]`. Reaching that state requires the full swarm path —
  `swarm-plan → /approve-swarm` (gate B, a real consent token gated by
  `swarm_approval_guard`) `→ swarm-dispatch`. So a completed `swarm-dispatch` *is* a
  legitimate Phase-6 completion; recognizing it as the `tdd` slot enforces the EXISTING
  Article IV ordering (6a/6b/6c), it does not relax it. The equivalence is **`tdd`-only**
  (unit-verified: `phaseSatisfied('security', Set(['swarm-dispatch']))` is `false`), so no
  other phase's ordering is broadened. `track_guard` is an *ordering* guard, not an
  anti-forgery mechanism — consent/forgery is enforced by the gate markers + tokens, which
  this change does not touch. Net: no new bypass; closes a false-block bug.
- **Recommendation**: none (no action). Recorded for the audit trail because the change
  edits an enforcement hook.

## Dependencies

No new packages. Pure Node (Set membership). `npm audit` surface unchanged.

## Out of scope / Noted

- The seed §4.1 amendment + §5 resolution + the D6 worker-template prose carry no security
  surface (documentation).
- D4 (swarm workers stopping after scenario) remains an OPEN reliability item in
  `swarm-mode-first-run-hardening-e3f2` — not a security issue.

