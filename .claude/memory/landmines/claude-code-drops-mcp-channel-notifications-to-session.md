---
key: claude-code-drops-mcp-channel-notifications-to-session
category: landmines
scope: [tdd]
verified-at: ca592c2
last-touched: 2026-06-23
---

- Landmine: an MCP server's `server.notification({ method: 'notifications/claude/channel', ... })` push into a Claude Code session is LOSSY — notifications arriving while the session is mid-turn or idle are silently dropped/coalesced (Claude Code issues #38736 "only first channel notification per session delivered", #61797 "MCP notifications dropped to idle session"). Headless `-p` sessions never autonomously take a turn on an event; there is no "wake on notification." So a push-into-session coordination model CANNOT be relied on for correctness.
- Proven live (sprint-pool-broker-transport dogfood, 2 real sessions): the broker fired `task-claimed` AND `task-done` through the identical `bridgeEvent → server.notification` path; the lead received the claims but NOT the dones (same code path, different delivery outcome) — the loss is in Claude Code's delivery layer, not the broker. Our code was verified symmetric + correct first.
- Mitigation (the pattern): **events are hints, state is truth.** Never depend on receiving every discrete push. Expose an authoritative PULL (here `sprint_status` → the lead reads `activeBroker.state` in-process, lossless) and reconcile from it before deciding anything is complete. A dropped push then becomes harmless. Do NOT build a fleet of headless peers that autonomously react to pushed channel events — that's the unsupported path; use lead-spawned `swarm-worker` subagents (Task tool, synchronous) or an Agent SDK loop instead.
