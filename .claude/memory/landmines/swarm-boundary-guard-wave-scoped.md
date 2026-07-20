---
key: swarm-boundary-guard-wave-scoped
category: landmines
scope: [scout, spec, tdd, security, integrate]
verified-at: cd062af
last-touched: 2026-06-21
---

- Path: `.claude/hooks/swarm_boundary_guard.mjs` — the `if (!existsSync(activePath)) emitAllow()` short-circuit (activePath = `.claude/state/swarm/active_wave.json`).
- Trap: `swarm_boundary_guard` enforces write_set discipline ONLY during an active swarm wave — its first check short-circuits to ALLOW when `active_wave.json` is absent. So a maker running OUTSIDE a swarm wave (a Workflow-runtime maker, or any agent not under `/swarm-dispatch`) gets NO write_set enforcement from this guard. Confirmed in the maker-checker PoC (2026-06-05): the guard fired on a workflow-agent write ONLY after `active_wave.json` was synthesized; with it absent the same write passes. By contrast `tdd_order_guard` and `verify_pass_guard` are state-independent and DO fire unconditionally on workflow agents.
- Mitigation / implication for v1 (`-9360`): a workflow-based maker needs write_set enforcement by EITHER (a) synthesizing an `active_wave.json` carrying the maker's write_set before dispatch so the existing guard applies, OR (b) adding a dedicated workflow-maker write_set guard. Do NOT assume `swarm_boundary_guard` governs a non-swarm maker.
