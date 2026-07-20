---
key: .claude/skills/tdd/SKILL.md:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: Phase 6 TDD coordinator. Thin orchestrator — decides scenario recipe + implementation contract in main context, writes state at `.claude/state/tdd/<slug>.json`, seeds per-worker tasks (scenario, implement, verify-tick, design-ui-tick, drift-check-tick, tdd-finalize) into the TaskList, yields with `harness_state.continue` so the harness invokes each worker as its own tick. No subagent delegation; no nested Skill calls. The harness inlines verify-tick mechanically rather than invoking the (contract-only) verify skill.
- Companion: `.claude/skills/scenario/SKILL.md` (worker that writes failing tests), `.claude/skills/implement/SKILL.md` (worker that makes them pass), `.claude/skills/design-ui/SKILL.md:1` (UI surface worker per `## Design calls` row), `.claude/skills/tdd/drift_check.mjs:1` (drift-check-tick actuator).
- Caveat: prereq is approved-spec OR `entry_phase == tdd` (quickfix/bugfix). The seeded worker chain is one Skill call per tick — the coordinator does NOT loop internally over workers (that would violate Article II's "decisions in main context, workers execute pre-decided recipes" rule). drift-check-tick fires before tdd-finalize so the spec-to-implementation cross-check happens while the harness is still in the TDD phase rather than as a sibling phase.
