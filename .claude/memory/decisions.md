---
owners: [spec, rca]
category: architectural decisions
size-cap: 500
key: short slug
verifies-against: spec/rca artifact
---

# Architectural decisions

Why this repo took the path it took. Includes rejected alternatives so a future session doesn't re-litigate.

Each entry's stable key is a short slug (e.g., `subagents-vs-skills`, `worktree-isolation`).

---

## subagents-vs-skills

- Decision: collapsed 10 baseline subagents to 1 (`swarm-worker`); every other capability lives as a skill in main context.
- Rationale: subagents lose conversational context (screenshots, offhand feedback, prior rounds) and produce visibly worse output on judgment-heavy tasks (UI, code architecture, prose). Skills run in the same head as the conversation; richness is preserved. The single remaining subagent earns its keep on **physical filesystem isolation** for parallel work, which skills can't provide.
- Rejected alternatives:
  - Keep the 10-subagent fleet → ui-ux-designer empirically failing despite preloaded `impeccable` (decisions starvation).
  - Per-skill memory-bearing subagents → adds context layers that thin discipline rather than concentrate it.
- Source: this conversation, 2026-04-27 refactor.
- Verified-at: HEAD
- Last-touched: 2026-04-27
