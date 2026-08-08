---
key: decay-is-per-category-three-reasons-2026-08-04
category: decisions
scope: []
governs: .claude/skills/memory-index/categories.mjs, .claude/hooks/lib/memory_session_start.mjs
rests_on: zero-runtime-dependencies
load_bearing: true
verified-at: f7da5a7
last-touched: 2026-08-04
---

- Decision: memory decay is a **per-category property with three distinct reasons**, not one global rule with exceptions. `categories.mjs` encodes it as two separate named sets, `STALE_EXEMPT` and `SUPERSESSION_DRIVEN`, plus the default.
- `decisions` — supersession-driven, never age out. A decision expires by being superseded, not by elapsed time: an open decision is still in force however old the commit that verified it. Re-verification pressure comes from CLAUDE.md Article IX.2 (every skill re-verifies before citing), NOT from the decay sweep. Measured effect on landing: `decisions.md` stale went 26 → 0, total store stale 173 → 147.
- `constraints` — DO age out, deliberately. `state_verified_at:` records when someone last checked whether the constraint still holds, which is exactly the thing that goes stale. A constraint is mutable and re-verifiable where a decision is immutable and superseded.
- `backlog` — exempt for its own, older reason: it holds intent, and intent does not verify against code.
- **The two sets are kept separate on purpose.** They have the same effect on the predicate today, which is precisely why merging them is tempting and wrong: they encode different reasons, and one set erases both. If you find a single `STALE_EXEMPT` containing `backlog` and `decisions`, that is the regression.
- Rejected: widening `STALE_EXEMPT_FILES` to include `decisions` (one-line change, satisfies the AC, destroys the distinction). Rejected: leaving decisions on age decay and raising the threshold (treats the symptom; the predicate was built for `path:line` landmarks and is simply the wrong question to ask a decision).
- Consumers: `memory_session_start.mjs → isStale()` is the only reader today. `/memory-flush` Step 0c stale-sweep inherits the corrected counts.
