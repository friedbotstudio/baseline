---
key: gate-collapse-approve-direction-at-intake-2026-07-16
category: decisions
scope: [spec]
source: engineer decision, gate-A approved 2026-07-16. Archive: `docs/archive/2026-07-16/gate-collapse/`.
verified-at: c78d3c1
last-touched: 2026-07-16
---

- Decision: D3/CO-E collapses the standard solo workflow's human touchpoints 3→2. The human spec gate `/approve-spec` is **renamed** `/approve-direction` and **moved to intake** (gate A now fires right after `/intake`, before scout); the spec is machine-reviewed (spec-traceability + checker fan-out + shippability + `spec_design_calls_guard` + drift-check), never human-eyeballed. Landing gate (`/grant-commit`) unchanged. Hook `spec_approval_guard`→`direction_approval_guard` (rename, count stays 26); command rename, count stays 6.
- Key sub-decisions (spec `## Decisions` D-1..D-7, all engineer-owned, gate-A approved): token path REUSES `spec_approvals/<slug>.approval` (D-2) so `epic_approval_guard`/`track_guard` keep their forge-proof root — the `direction_approvals/` rename is deferred. The shippability/checker BLOCKED cross-checks RELOCATE from the token-write guard to a NEW harness `pre-implementation-gate.mjs` checkpoint (D-6), wired in `harness/SKILL.md` before `implementation` — a BLOCKED verdict yields as a spec defect (NOT a consent gate). Class-off degrade (D-5): 3→2 ships ON; the 2→1 single-auth collapse is gated behind `governance.class.enabled` (default off → two gates, `gate-collapse-resolver.mjs` fail-safe).
- Why intake, not spec: brainstorm verbatim — "lock direction the moment the request is framed, before spec work." Reference target (CO-B) is machine-enforced at spec time, so the human gate carries CO-A evidence only (revises CO-E AC2).
