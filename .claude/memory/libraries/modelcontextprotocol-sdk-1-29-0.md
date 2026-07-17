---
key: @modelcontextprotocol/sdk@1.29.0
category: libraries
scope: [research]
verified-at: 8e6f904
last-touched: 2026-06-23
caveat: currently a **devDependency** in this dev repo — NOT yet reaching consumer installs. The SDK-free coordination CORE (`.claude/mcp/sprint-channel/handlers.mjs`+`lib/`) is stdlib-only and ships fine; the thin `server.mjs` needs the SDK, so consumer delivery is DEFERRED to the own-package/npx move (backlog [[sprint-channel-own-package-sdk-delivery-ac005-slice-c]]) — registering `server.mjs` in `.mcp.json` before that move would ship a consumer-broken server. Pin exact `1.29.0` per maintainer instruction (Q5, "pin it hard") + `check-files-diff DEVDEP_RANGE_FORBIDDEN`; the v2 line publishes as `@modelcontextprotocol/server` (alpha) and is NOT adopted.
---

- Library: MCP TypeScript SDK (`@modelcontextprotocol/sdk`), HARD-pinned exact `1.29.0` (no caret) — the build substrate for the baseline-owned sprint coordination channel (epic `mvp-sprint-parallel-cycles`, Slice C live server). NOW INSTALLED: `package.json:54` + `package-lock.json:1376` (`version 1.29.0`). See decision [[sprint-mode-mcp-channel-architecture-pivot-2026-06-23]].
- Role: build a LOCAL MCP server over stdio. Used by `.claude/mcp/sprint-channel/server.mjs` (imports `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` + `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`). Key API (context7 `/modelcontextprotocol/typescript-sdk/v1.29.0`, 2026-06-23): `server.registerTool(name,{description,inputSchema:{…zod shape}},handler)`; `await server.connect(transport)`. v1.29 CONFIRMED to have `registerTool` + stdio (not only v2). Pairs with `zod` for schemas.
