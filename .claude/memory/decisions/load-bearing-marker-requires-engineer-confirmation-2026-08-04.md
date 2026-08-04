---
key: load-bearing-marker-requires-engineer-confirmation-2026-08-04
category: decisions
scope: any
governs: .claude/skills/workspace/placement.mjs,.claude/skills/code-structure/SKILL.md,.claude/memory/decisions/**
load_bearing: true
verified-at: 39464a1
last-touched: 2026-08-04
---

- Decision: **Claude may propose `load_bearing: true` with cited rationale; the engineer confirms before it sticks.** Spec decision D5 of `living-system-model-ef`, `owner: engineer`, answered by the human at triage.

> Engineer confirms each one — Claude proposes `load_bearing: true` with cited rationale; you confirm before it sticks.

- This closed one of the four open questions the parent epic `living-system-model` carried: whether Claude may set the marker unaided was recorded as unresolved at epic discovery.
- Why: the marker gates where annotations land in real source. An unaided wrong call either scatters comments across code nobody will break, or withholds them from the one place a maintainer would confidently break something. Keeping placement conservative is the whole design intent of slice F — a comment on every file is a comment on nothing.
- Mechanically: `proposeLoadBearing({memDir, key, rationale})` returns `{written: false, reason: "awaiting engineer confirmation"}` and hands back the rationale to judge. Only `confirmed: true` writes. The check is `confirmed !== true` rather than truthiness, deliberately — a gate that accepts a truthy accident is not a gate.
- Source: `source: user-instruction`, captured via `AskUserQuestion` at `/triage` and recorded in `workflow.json → confirmed_decisions` before the build started.
