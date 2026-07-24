---
key: sprint-mode-dogfood-config-mcp-register-and-flag-flip
category: backlog
scope: []
status: picked-up
raised-on: 2026-06-23
raised-in-context: sprint-dispatch
source: assistant-deferral
estimated-effort: small (config + a 3→4 count cascade)
parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
verified-at: 3d3cda7
last-touched: 2026-06-23
superseded-at: 2026-07-24
---

> verbatim (assistant-deferral + user direction, 2026-06-23): user — "after C we will configure this session for dogfooding"; "in next session we will have a companion session to help". The dogfood-config is the explicit next step.

- Intent: make slice C (`sprint-dispatch`, the sprint-mode prototype) actually RUNNABLE for a dogfood. Slice C built + committed the machinery (live `server.mjs`, `/sprint-dispatch` SKILL, helpers, worker-template protocol, the SDK as a devDep) but deferred the two config touches that turn it on.
- Steps (the dogfood-config): (1) add the channel server to `.mcp.json`: `"sprint-channel": { "command": "node", "args": [".claude/mcp/sprint-channel/server.mjs"] }` — this TRIGGERS a **3→4 MCP-server count cascade**: add `4: 'four'` to `derive-counts.mjs SPELLED` (else the site's `numToWord(4)` THROWS — same class as the category-count landmine) and bump every "3 MCP servers" surface (CLAUDE.md×?, seed.md digit + word, README, CONSTITUTION + both mirrors), then `npm run build` + audit. (2) flip `velocity.sprint_mode.enabled = true` in `project.json`. (3) a companion human-launched Claude Code session registers as a `pclass: "session"` peer; the lead dispatches a small 2-independent-task sprint and watches claim/done/yield over the live channel.
- Why deferred from slice C: adding the `.mcp.json` entry in slice C would ship a consumer-broken server (no `@modelcontextprotocol/sdk` in consumer installs until the own-package move `[[sprint-channel-own-package-sdk-delivery-ac005-slice-c]]`), and sprint mode is off by default — so the registration belongs to the dogfood-config, run in this dev repo where the SDK is installed.
