---
key: chore-track-integrate-and-simplify-prereqs-are-structurally-unsatisfiable
category: landmines
scope: [tdd, integrate]
verified-at: 3160e0c
last-touched: 2026-07-12
---

- Path: `.claude/skills/integrate/SKILL.md` (Prereq) + `.claude/skills/simplify/SKILL.md` (Prereq) + `.claude/skills/chore/SKILL.md` (Phase shape → conditional phases) + `.claude/workflows.jsonl` (the `chore` track DAG) + `.claude/skills/triage/SKILL.md` (the chore decision rule).
- Trap: both review skills declare prereqs that a `chore` track can NEVER satisfy. `integrate` requires `simplify` in `completed` AND (`security` in `completed` OR in `exceptions`) — but the chore DAG has **no security node**, and chore's own conditional list is `verify / simplify / integrate / document` with security absent, so `security` lands in neither set. `simplify` requires `tdd` in `completed` — but `tdd` is always a chore *exception* and never completes. Meanwhile `/triage`'s chore rule says to "leave `simplify`, `security`, `integrate`, `document`, `archive` and `commit` in the phase list", which contradicts chore's own conditional list. Verified live 2026-07-12 (`unified-execution-roadmap`): a chore whose diff legitimately fired the `integrate` trigger could not satisfy `integrate`'s stated prereq.
- Mitigation: on a `chore` track, read both prereqs as **track-scoped** — the binding clause is `last_test_result` line 1 == `PASS`, not the phase-membership clause, which is written for the spec/tdd pipeline. Do **NOT** "fix" this by adding `security` (or `tdd`) to `workflow.json → exceptions` mid-flight to force the prereq green: Article IV reserves the `exceptions` array for `/triage` and the post-tdd right-size gate, and a phase skill mutating it is exactly the silent-relaxation the constitution forbids.
- The real fix (not yet done): reconcile the three documents — either give chore an explicit `security` conditional trigger, or scope the two prereqs by track. This is a contract inconsistency between shipped skills, not a code bug.

---
