---
key: epic-11-slice-d-needs-respec-against-org-dispatch
category: backlog
scope: []
governs: .claude/skills/org-dispatch/SKILL.md, .claude/skills/org-dispatch/org-mode.mjs, .claude/state/epic/mvp-sprint-parallel-cycles.json
status: picked-up
source: inferred-from-code
deferred: dependency
raised-on: 2026-08-17
raised-in-context: epic11-slice-e-superseded
verified-at: 309d70e
last-touched: 2026-08-17
superseded-at: 2026-08-19
---

- **Respec before building.** Epic 11 slice D ("Merge + integrate + single gate-C on the sprint result") has acceptance criteria written against `sprint-dispatch`, which is retired and off disk. `.claude/skills/` now holds `org-dispatch`, `sprint-oracle`, `sprint-plan`, `sprint-planner` — no `sprint-dispatch`. Building D as written would target a component that does not exist.
- **Measured 2026-08-17 against `org-dispatch`, AC by AC:**

  | AC | Status |
  |---|---|
  | 1. Merge-audit lifting `swarm_merge` write-set discipline | **Not covered.** `org-mode.mjs` carries `write_set` through `toLaneTasks` and audits nothing against it. |
  | 2. Commit-between-rounds forks from fresh HEAD | **Covered** — `org-dispatch/SKILL.md:33`, the round-boundary rule. |
  | 3. Exactly one integrate pass over the merged result | **Not covered.** Stated nowhere in the skill or its helpers. |
  | 4. A single grant-commit covers the batch | **Partial.** `SKILL.md:38` keeps consent gates structural and un-forgeable, but never states that one grant covers the pod result, and never reconciles with `commit/SKILL.md` Step 2.8 + `epic_close.mjs`. |

- **So one AC is already done and three are live.** A respec should drop AC2 as satisfied and retarget the other three at `org-dispatch`, not carry all four forward.
- **Do not close D as superseded the way E was.** E had a genesis declaration retiring its slot ([[epic-11-slice-e-superseded-by-article-x]]); D has no such declaration, and ACs 1 and 3 describe behaviour that demonstrably does not exist. Marking it done would record unbuilt work as delivered.
- Reason `dependency`: the respec needs the org-dispatch merge path settled first, and that is a spec-track question, not a backlog tweak.
