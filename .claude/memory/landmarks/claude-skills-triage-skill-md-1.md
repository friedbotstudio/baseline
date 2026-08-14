---
key: .claude/skills/triage/SKILL.md:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: workflow entry point. Selects `track_id` from the nine selectable tracks (intake-full / spec-entry / tdd-quickfix / chore / freeform / epic / epic-child / org / power), writes `.claude/state/workflow.json`, seeds the `TaskCreate` checklist for every non-excepted phase + consent-gate placeholders (with `metadata.needs_user: true`). Auto-adds `swarm-plan`, `approve-swarm`, `swarm-dispatch`, `grant-commit`, `commit` to `exceptions` when the project is non-git.
- Caveat: `entry_phase` was the pre-§18 field name and is gone; `workflow.json` now carries `track_id`, and `harness` migrates an old file in preflight Step 3a. The canonical task templates that the harness re-seeds from on every tick live inside this SKILL.md. Article V's "task discipline" rule depends on those templates being authoritative; if you change a phase's task shape, update the template here so harness re-seeding stays reconciled with `workflow.json → completed`.
