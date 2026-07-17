---
key: gate-taxonomy-7-kind-closed-set-2026-07-16
category: decisions
scope: [spec]
source: engineer decision, gate-A approved
verified-at: c9d8f0e
last-touched: 2026-07-16
---

- Decision: C6's classifier ([[gate-taxonomy-classifier-c6]]) shipped with a **7-kind** closed operation set, not the brainstorm's illustrative 5. Added `config-flip` → `policy-flip` and `requirement-conflict` → `contradictory-requirements` beyond {git-op, destructive-bash, consent-token-write, phase-skip, spec-widen}.
- Why: the illustrative 5 only exercised 2 of the 4 XI.12 categories; intake AC-4 required "no dead category" and the goal was to *generalize the XI.12 category list*, so all four must be reachable by an operation kind. Surfaced as the sole gate-A decision (7-kind recommended vs 5-kind strict); human approved 7-kind at `/approve-spec` 2026-07-16.
- Also decided: `CONSENT_POINT_MAP` is exported but **test-only** this slice (no runtime consumer — YAGNI); the module ships with **no feature flag** (nothing imports it, so nothing to gate) — advisory-only until a real caller arrives.
- Archive: `docs/archive/2026-07-16/gate-taxonomy/` (spec `## Decisions` D1–D3).
