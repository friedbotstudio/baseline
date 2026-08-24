---
key: baseline-channel-peer-id-reaches-mcp-instructions-unvalidated
category: backlog
scope: []
status: open
raised-on: 2026-08-22
raised-in-context: baseline-mcp
source: assistant-deferral
estimated-effort: small
verified-at: 3eafe4f
last-touched: 2026-08-22
governs: .claude/mcp/baseline/lib/instructions.mjs
---

- Intent: MEDIUM from `docs/archive/2026-08-22/baseline-mcp/security.md`. `CHANNEL_PEER_ID` is read straight from `process.env.BASELINE_CHANNEL_PEER_ID` and interpolated into the MCP `instructions` string with no validation — no charset check, no length bound, no escaping. That string tells the model what role it holds, so anything in the variable becomes instruction text (CWE-74). Epic 13 did not create the pattern but raised its reachability: it moved from the unregistered research-preview `sprint-pool` server onto `baseline`, which `.mcp.json` registers and every session loads. Fix is one line — gate the read through `isSafeId`, already imported in the sibling module — and an empty id already degrades cleanly.
