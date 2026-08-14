---
key: .claude/skills/power/SKILL.md
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: the `power` batch-sprint track (defined in `.claude/workflows.jsonl`), landed `e90bfdc`. Delivers a sprint of related, spec-committed tickets in ONE cycle, reusing the standard phase skills. Hosts exactly the two behaviours that make it a *batch* pipeline: (1) **per-ticket iteration** — `security` runs once PER TICKET over `workflow.json → tickets[]` while the mechanical phases run once for the batch; (2) **commit split** — at the commit phase, group the batch's tree into ordered Conventional Commits via `commit-split.mjs`, closure last. Invoked from within a `power`-track workflow, never standalone.
- Companion: `.claude/skills/power/commit-split.mjs` (the split actuator), `.claude/skills/sprint-planner/SKILL.md` (proposes the ticket set the track consumes), `.claude/workflows.jsonl` (track DAG). Opt-in via `project.json → velocity.power_mode.enabled`; requires git.
