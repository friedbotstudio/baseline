---
key: src/cli/workflows-validator-predicates.js:1
category: landmarks
scope: [scout]
---

- Role: Foundation — closed v1 predicate vocabulary for Track/selector preconditions. Five predicates: `requires_git` (work-tree), `requires_user_override` (force-flag), `requires_min_components` (spec count ≥ N), `requires_phase_completed`, `requires_skill_present`. Each `evaluate<Name>(arg, ctx)` returns boolean; caller passes `ctx = {workflow, project, slug}`. Adding a predicate: implement here, add to `KNOWN_PREDICATES`, update I11, note in seed.md §18.4.
- Companion: `src/cli/workflows-validator-invariants.js:1`, `src/cli/track-tasklist-materializer.js:1`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
