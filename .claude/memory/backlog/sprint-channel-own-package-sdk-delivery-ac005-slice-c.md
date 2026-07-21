---
key: sprint-channel-own-package-sdk-delivery-ac005-slice-c
category: backlog
scope: []
status: picked-up
raised-on: 2026-06-23
raised-in-context: sprint-channel-mcp
source: assistant-deferral
estimated-effort: medium (monorepo publish wiring is the real cost, not the server code)
parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
verified-at: 80aeeca
last-touched: 2026-06-23
superseded-at: 2026-07-21
---

> verbatim (assistant-deferral, slice-B gate, 2026-06-23; user concurred): "publish the server as its own package, keep it in the same github repo... and we install sdk when user installs baseline (similar to plantuml)" → resolved to the own-package/npx form.

- Intent: deliver AC-005 of `mvp-sprint-parallel-cycles` Slice B — the live MCP channel server + its `@modelcontextprotocol/sdk@1.29.0` dependency reaching consumer installs. Slice B (`sprint-channel-mcp`, committed) built only the SDK-FREE coordination CORE (`.claude/mcp/sprint-channel/` handlers+lib); the thin `server.mjs` (McpServer + StdioServerTransport, context7-verified) and `.mcp.json` registration were DEFERRED here.
- Approach (decided): publish `sprint-channel` as its OWN npm package in the SAME repo via **npm workspaces** + **changesets** (or `semantic-release-monorepo`) + a CI publish step, so `.mcp.json` does `npx -y @friedbotstudio/sprint-channel-mcp` — the plantuml/context7 model: SDK bundled with the published package, fetched on demand, the baseline stays **zero-runtime-dep**. A local-file server cannot npx-fetch its own dep, which is why the own-package move (not a `package.json` dep) is the clean resolution.
