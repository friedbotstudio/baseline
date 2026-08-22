---
key: sprint-channel-mcp-registration-2026-07-25
category: decisions
scope: [org]
verified-at: 7bcaa4b
last-touched: 2026-07-25
source: assistant-decision + user AskUserQuestion (2026-07-25). Roadmap Epic 5 task S4; workflow s4-sprint-mode-dogfood-config (chore). Backlog sprint-mode-dogfood-config-mcp-register-and-flag-flip.
---

> verbatim (user, AskUserQuestion 2026-07-25): chose "sprint-channel only, 3→4" over registering both servers.

- Decision: S4 registered ONLY `sprint-channel` in `.mcp.json` (+ shipped `src/.mcp.template.json`) as `{command:"node", args:[".claude/mcp/baseline/server.mjs"]}` — the 4th baseline MCP server. This is a **3→4** MCP-count cascade, NOT the 3→5 the roadmap prose originally implied.
- Why not sprint-pool: `sprint-pool/server.mjs` is a **channel/broker** server (Unix-socket broker + `claude/channel` push), launched via `claude --dangerously-load-development-channels server:sprint-pool`, and its own header declares it "NOT baseline-owned, NOT shipped". It is NOT a stdio server, so a `.mcp.json` stdio entry would ship a broken/incorrect registration to consumers. sprint-pool stays a dev-launched channel server for the dogfood; only `sprint-channel` (a real stdio MCP server) is registered. The roadmap S4 prose was corrected to match.
- The `velocity.sprint_mode.enabled` flag was already `true` — no flip was needed (the roadmap's "flip the flag" was already satisfied on disk).
- Cascade surfaces (the full 3→4 set, for future count changes): `.mcp.json` + `src/.mcp.template.json`; `EXPECTED_MCP_SERVERS` in `.claude/skills/audit-baseline/expected-baseline.mjs` (audit is bidirectional — a `.mcp.json` server absent from EXPECTED flags "unexpected"); `derive-counts.mjs` SPELLED map needed `4:'four'` (else `site-src/_data/baseline.cjs → numToWord(4)` THROWS at site build); CLAUDE.md:314 + `src/CLAUDE.template.md` (byte-equal mirror); `docs/init/seed.md`:40 + :302 + `src/seed.template.md`; `README.md`:69; `.claude/CONSTITUTION.md`:160; `site-src/install.njk` (two hardcoded "three baseline MCP servers" literals; `index.njk` is data-driven via `mcpServersWord`). Then `npm run build` + audit-baseline.
- Closes Epic 5 (S1–S4 all ✅). See [[stale-lock-ttl-reclaim-2026-07-24]] (S3, unblocked this dogfood) and [[sprint-mode-mcp-channel-architecture-pivot-2026-06-23]].
