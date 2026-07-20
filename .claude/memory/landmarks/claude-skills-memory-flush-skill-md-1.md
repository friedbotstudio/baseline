---
key: .claude/skills/memory-flush/SKILL.md:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: Workflow Phase 10.6 owner + ad-hoc curation entry point. Runs between `/archive` (Phase 10.5) and `/grant-commit` (Phase 11) on every track (intake / spec / tdd / chore). The skill SOP composes three `sweep.mjs` modes (auto-close / prose-scan / stale-sweep) for canonical-file closure (Step 0), then triages `_pending.md` candidates through promote / discard / defer (Steps 1–5), then resets `_pending.md` to skeleton (Step 5), then emits a Step 6 report. On **empty `_pending.md` body** (zero `## CANDIDATE:` blocks) the skill fast-paths: Step 0 sweeps still run unconditionally, Steps 1–5 are skipped, Step 6 emits a one-line "no pending candidates" report. Empty-pending fast-path still appends `"memory-flush"` to `workflow.json → completed` so `/commit`'s prereq is satisfied either way.
- Companion: `.claude/skills/memory-flush/sweep.mjs:1` (the deterministic actuator the SOP invokes), `.claude/hooks/memory_session_start.mjs:1` (the debt-mode session-start nag that signals when ad-hoc invocation is needed outside a workflow), `.claude/skills/commit/SKILL.md:1` (Phase 11 sibling whose prereq depends on this skill's completion).
- Caveat: the empty-pending fast-path skips Steps 1–5 but NOT Step 0 — auto-close on `pending-questions.md` entries carrying `resolved-at:` runs regardless of pending body state. This is how Q-001's resolution propagated in the meta-bootstrap workflow that introduced Phase 10.6. The session-start nag in `memory_session_start.mjs` fires only on K>0 AND `workflow.json` absent (debt-mode); during an active workflow the nag stays silent because this skill's Phase 10.6 invocation handles flushing.
