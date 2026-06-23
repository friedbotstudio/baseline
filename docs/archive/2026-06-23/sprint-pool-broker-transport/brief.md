# Brainstorm brief — sprint-pool-broker-transport

## Actor

Pool lead session (hosts the in-process broker) + idle peer sessions (broker clients). In the target topology each peer session runs in its own repo clone on its own branch; the lead merges peer branches into main.

## Trigger

Sprint mode scales from one shared working tree to multi-session, dev-team style: each peer clones the repo into its own directory and works its own branch; the lead integrates via git merges to main.

## Current State

Coordination is shared JSON files (tasks.json/yields.json) under a channelRoot anchored to each session PROJECT_DIR (.claude/mcp/sprint-pool/server.mjs:25-27), read by a per-process 750ms watch loop that pushes notifications/claude/channel events into its own session. It works only while all sessions share one working tree; under clone-per-peer each session has a different channelRoot, so claims/yields/done-signals never cross sessions. It also carries a monotonic seen-dedup bug (re-dispatched task never re-notifies) and an unresolved-yield bug (release leaves the yield open) — the superseded narrow fix.

## Desired State

The lead-MCP-server hosts an in-process broker that is the sole writer of tasks/yields/peers and listens on a Unix-domain socket. Peer-MCP-servers become broker clients over that socket: they forward tool calls (register/claim/signal_done/yield) and receive pushed events, then emit notifications/claude/channel into their own session. Event-native push replaces the poll-watch loop, dissolving the dedup bug class; the yield-resolution logic is preserved inside the broker. The socket path is a shared rendezvous via the  env var, set OUTSIDE any clone, so separate clones reach the same broker. The existing handlers.mjs/store.mjs coordination logic is reused verbatim inside the broker (only the transport changes), and the broker is file-backed for crash-restart recovery. The work is designed as a clean component split (NDJSON codec / broker state core / client adapter / lifecycle) so the implementation phase can be swarmed.

## Non Goals

Cross-machine or network transport (UDS is single-machine; TCP/sockets-over-network is a later step). Peer authentication beyond filesystem socket permissions. Any edit to baseline-owned files outside the project-local sprint-* MCP directories. The fs.watch micro-optimization (the entire watch loop is being removed, not tuned).

## Solution Leakage

*(not captured)*
