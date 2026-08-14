---
key: src/cli/workflows-validator-predicates.js:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Foundation — closed v1 predicate vocabulary for Track/selector preconditions. Seven predicates: `requires_git` (work-tree), `requires_user_override` (force-flag), `requires_min_components` (spec count ≥ N), `requires_phase_completed`, `requires_skill_present`, `requires_commit_consent`, `requires_config_flag` (takes `path` + `equals`; strict equality, fails safe to false). Each `evaluate<Name>(arg, ctx)` returns boolean; caller passes `ctx = {workflow, project, slug}`. Adding a predicate: implement here, add to `KNOWN_PREDICATES`, update I11, note in seed.md §18.4.
- Companion: `src/cli/workflows-validator-invariants.js:1`, `src/cli/track-tasklist-materializer.js:1`.
