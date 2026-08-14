---
key: blanket-rename-sweep-inverts-eliminated-gate-and-spec-review-timing-semantics
category: landmines
scope: [tdd, integrate]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Trap: a repo-wide `/approve-spec`→`/approve-direction` prose sweep (gate-collapse D3) silently INVERTED meaning in nuanced sentences. `pre-implementation-gate.mjs` comment "the human /approve-SPEC gate eliminated" became "/approve-DIRECTION gate eliminated" (approve-direction is the NEW gate, not eliminated). The spec-review skills (`spec-diagram-review`, `spec-traceability-review`, `spec-rollout-enforceability-review`, `spec-shippability-review`) all read "BLOCKs/before `/approve-direction`" — temporally WRONG: they run AFTER the spec, but approve-direction now fires at INTAKE (before spec), so their verdicts block IMPLEMENTATION ENTRY via `pre-implementation-gate`, not a human gate. README/spec-SKILL closing-message told the user to approve AFTER the spec (gate is at intake). The pure `spec_approval_guard`→`direction_approval_guard` and marker renames were always safe; the `/approve-spec`→`/approve-direction` swap was the risky one.
- Mitigation: after a blanket gate-rename, grep for the swapped token near {eliminated, retired, former, old, removed, before, after, hard-block, BLOCKs, run before/after} and hand-verify each. A gate that MOVED phase-position can't be blanket-swapped in text that encodes WHEN it fires or WHAT it gates. Caught this session by a targeted over-reach grep during `/document`; all fixed before commit.
- Live 2026-07-16 (`gate-collapse`): ~5 semantic inversions across skill docs from one sweep; fixed in `/document`. Same class as [[baseline-skill-edit-needs-manifest-rebuild]] — a mechanical mass-edit has non-mechanical consequences.
