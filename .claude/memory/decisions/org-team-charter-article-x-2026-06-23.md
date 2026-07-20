---
key: org-team-charter-article-x-2026-06-23
category: decisions
scope: [spec]
source: spec at docs/archive/2026-06-23/org-team-charter/spec.md. Supersedes mvp-sprint-parallel-cycles Slice E (bounded charter). Docsite: /org/ (experimental).
verified-at: 6abf123
last-touched: 2026-06-23
---

- Decision: graduate sprint mode into a permanent org-team model under a NEW additive constitutional **Article X "Multi-session coordinated workflows"** (inserted between IX and X; old X project-specific → XI, old XI provenance → XII). NOT a §II.B / Article II amendment — Article II is byte-unchanged (verified by a regression-trap test).
- Engineer override (verbatim, codesign D4): "each peer is a claude-code session with all capabilities of running a sub-agents, parallel agents, and what-not with added advantage of connected via mcp for coordination, cross communication, and lead escalation. Subagent count = 1 sits orthogonal; ideally Art 2 doesn't even apply here. We may carve this out and maybe define a new Art 3 for multi session coordinated workflows"
- Shape: flat pod of up to 4 peer SESSIONS (not subagents; subagent count stays 1, per-session) over the MCP broker pool, one wearing the lead hat. Peers decide in-lane; un-decidable/cross-lane forks escalate peer→lead→human (yield_fork task-bound; ask_lead/answer_peer free-form broker channel). Opt-in `velocity.org_mode.enabled` (default off), requires git. New selectable `org` track; org-dispatch is the Phase-6 engine, graduating + retiring sprint-dispatch. Default 11-phase pipeline unchanged; consent gates stay structural.
