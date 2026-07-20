---
key: .claude/skills/memory-flush/route.mjs:1
category: landmarks
scope: [scout]
verified-at: 0e5cc8f
last-touched: 2026-07-09
---

- Role: Foundation — pure deterministic route classifier for `/memory-flush` (Tier 3, shipped in `memory-capture-tier2-tier3`). Exports `suggestRoutes(candidates)` returning one `{key, suggested_bucket, weight, evidence}` per pending candidate. `classify` is first-match-wins over four anchored regexes in priority order: PATH_RE → `landmark`, trailing `?` → `open-question`, FUTURE_RE (`TODO|backlog|follow-up|later|next we|defer`) → `backlog`, DECISION_RE (`decided to|the plan/approach/fix is|going to|chose|will use`) → `decision`, else `backlog`. `salience` returns 0.1 for chatter/short (<25 chars, no cue), 0.5 for backlog, 0.7 otherwise. PURE: no filesystem/network/model call. Per Article IX.3 the output only SUGGESTS an accept/override default — promotion to canonical stays human-only at `/memory-flush` Step 2.
- Companion: `.claude/skills/memory-flush/SKILL.md:1` (Step 2 optional route-suggestion aid), `.claude/hooks/lib/memory_stop.mjs:1` (writes the capture-time `route`/`weight` hints this refines), `tests/memory-flush-routing.test.mjs:1`.
