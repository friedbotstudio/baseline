---
key: .claude/skills/memory-sync/SKILL.md:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Workflow Phase 10.7 owner + ad-hoc curation entry point. Runs between `/roadmap-sync` (Phase 10.6) and `/grant-commit` (Phase 11) — `/archive` is Phase 10.5, two phases earlier, not the immediate predecessor on every track (intake / spec / tdd / chore). The skill SOP composes four `sweep.mjs` modes (auto-close / prose-scan / stale-sweep / backlog-decay) for canonical-file closure (Step 0), then triages `_pending.md` candidates through promote / discard / defer (Steps 1–5), then resets `_pending.md` to skeleton (Step 5), then emits a Step 6 report. On **empty `_pending.md` body** (zero `## CANDIDATE:` blocks) the skill fast-paths: Step 0 sweeps still run unconditionally, Steps 1–5 are skipped, Step 6 emits a one-line "no pending candidates" report. Empty-pending fast-path still appends `"memory-sync"` to `workflow.json → completed` so `/commit`'s prereq is satisfied either way.
- Companion: `.claude/skills/memory-sync/sweep.mjs:1` (the deterministic actuator the SOP invokes), `.claude/hooks/memory_session_start.mjs:1` (the debt-mode session-start nag that signals when ad-hoc invocation is needed outside a workflow), `.claude/skills/commit/SKILL.md:1` (Phase 11 sibling whose prereq depends on this skill's completion).
- Caveat: the empty-pending fast-path skips Steps 1–5 but NOT Step 0 — auto-close on `pending-questions.md` entries carrying `resolved-at:` runs regardless of pending body state. This is how Q-001's resolution propagated in the meta-bootstrap workflow that introduced this phase (then numbered 10.6; `/roadmap-sync` later took that slot). The session-start nag in `memory_session_start.mjs` fires only on K>0 AND `workflow.json` absent (debt-mode); during an active workflow the nag stays silent because this skill's Phase 10.7 invocation handles flushing.
