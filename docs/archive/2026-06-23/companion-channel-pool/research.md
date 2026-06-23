# Pattern Research — companion-channel-pool

Goal: peers auto-join a pool, receive work by push (not in-context polling), and escalate forks to the lead by push — lead arbitrates without hand-editing state. Bounded-executor contract preserved. Project-local prototype.

## Verified API facts (Claude Code channels — research preview)

Source: https://code.claude.com/docs/en/channels-reference (fetched 2026-06-23), https://code.claude.com/docs/en/channels.

- A channel is an **MCP `Server` with `capabilities.experimental['claude/channel'] = {}`**, spawned by the session as a **stdio subprocess**. Presence of that capability registers a notification listener.
- **Push:** `mcp.notification({ method: 'notifications/claude/channel', params: { content, meta } })` → arrives in-session as `<channel source="<server-name>" <meta-attrs>>content</channel>`. `source` is set automatically from the server name. `meta` keys must be `[A-Za-z0-9_]+` (hyphens silently dropped).
- **Two-way (reply):** add `capabilities.tools = {}` + `ListToolsRequestSchema`/`CallToolRequestSchema` handlers. Claude calls the reply tool; not channel-specific.
- **Runtime:** **Node, Deno, or Bun all work** — Bun is NOT required (doc: "your channel doesn't have to"). Only hard dep is **`@modelcontextprotocol/sdk`** — already present (`devDependencies@1.29.0`, in `node_modules`). ⇒ **the intake "Bun required" constraint is void.**
- **Registration:** `.mcp.json` (project, relative path) or `~/.claude.json` (user, absolute) as `{command, args}`. Claude Code spawns it at startup; first use prompts MCP-server consent.
- **Launch (custom/unlisted):** `claude --dangerously-load-development-channels server:<name>` (bare `.mcp.json` server) or `plugin:<name>@<marketplace>`. Per-entry bypass; `channelsEnabled` org policy still applies.
- **Delivery semantics:** notifications are fire-and-forget (resolve on transport write, not on processing); dropped silently if the session isn't listening; **queued and delivered in order, batched on the next turn**. "To process independent event streams concurrently, run separate sessions" — i.e., one channel subprocess per peer session.
- **Permission relay** (`claude/channel/permission`): optional; forwards tool-approval prompts. Only declare if the sender is authenticated.

## Candidate A: fs-watch bridge over the existing file-channel (RECOMMENDED)

- **Summary:** Keep the existing file-locked `sprint-channel` (MCP store) as the coordination **truth**. Add a thin **project-local channel server** that each peer session spawns; on startup it registers the peer (direct write to `sprint.json` — it's a Node process with fs access, satisfying auto-join with zero `/companion on`), then **watches the shared channel dir** (`.claude/state/sprint/<id>/tasks.json` + `mailbox.jsonl`). On a relevant change it pushes a `<channel source="sprint-pool" ...>` event telling the peer to claim. The lead enqueues by writing a task (new `enqueue_task`); the lead's own channel subprocess watches `yields.json` and pushes a fork escalation into the lead session. Re-dispatch = lead updates the task (via `recordArbitration` + a release write); the peer's watcher pushes the update.
- **API references (current):**
  - `@modelcontextprotocol/sdk@1.29.0` — `Server` + `experimental['claude/channel']`, `mcp.notification('notifications/claude/channel', …)` — channels-reference (above). Same SDK `server.mjs` already imports.
  - `node:fs` `watch`/`watchFile` — Node ≥18.17 (our engine) — standard lib.
  - existing `.claude/mcp/sprint-channel/handlers.mjs` `claimTask`/`signalDone`/`yieldFork` (race-safe via `lib/lock.mjs`) — reused unchanged.
  - existing `.claude/skills/sprint-dispatch/yield-arbiter.mjs` `recordYield`/`recordArbitration` — reused for AC-5.
- **Fits:** Yes — anchors on the scout's "session peers already preferred" (`peer-select.mjs`) and the three-layer split: new push logic is Orchestration (a new server) + a small enqueue Domain handler; the file-locked store stays the substrate. No double-claim risk: claiming still goes through the existing locked `claimTask`.
- **Tests it enables:** unit tests on `enqueue_task` (append pending task, dup-id reject, dependency-claimability) like the existing 13 handler tests; a watcher-emits-notification unit test (fake fs change → assert `notification` called) without mocking internal modules — the watcher is driven by a real temp dir. No mocked DB/channel.
- **Tradeoffs:** `fs.watch` reliability varies by OS (macOS FSEvents coalescing, no recursive on Linux). Mitigation: the channel subprocess may fall back to a cheap fixed-interval `statSync` poll — acceptable because the **model** never polls; a tiny dedicated subprocess does. Per-peer subprocess multiplies processes (one channel per peer) — fine at ~5.

## Candidate B: localhost HTTP port per peer (the doc's webhook pattern)

- **Summary:** Each peer channel listens on a localhost port (`Bun.serve`/`node:http`); the lead POSTs work to a peer's port. Mirrors the channels-reference webhook walkthrough directly.
- **API references:** same SDK; `node:http` server; channels-reference webhook example.
- **Fits:** Partially. It's the documented happy path, but it introduces **addressing the file-channel already solves** — the lead must discover each peer's port (a registry of peer→port), and bind N ports. The shared dir gives addressing for free.
- **Tests it enables:** HTTP POST → notification integration test.
- **Tradeoffs:** Port allocation/discovery/cleanup across N peers; stale-port failures (the doc itself calls out `lsof`/`kill` recovery). More transport surface than the need warrants (YAGNI). Reintroduces a second source of truth alongside the file-channel.

## Candidate C: status-quo polling + auto-join only (baseline / reject for the push AC)

- **Summary:** Auto-register on launch and tighten the poll interval; no channel/push.
- **Fits:** Meets AC-1 (auto-join) but **fails AC-2** (push, no polling). The in-context poll loop is exactly the scale problem.
- **Tradeoffs:** Cheapest, zero new dep, but doesn't deliver the stated need. Useful only as the fallback if channels (research-preview) prove too unstable to depend on.

## Recommendation

**Candidate A.** It satisfies push (AC-2), escalation-by-push (AC-4), and arbitrate-without-hand-edit (AC-5) while reusing every race-safe primitive we already tested live, and it needs no Bun and no new dependency. The Claude Code channel is reduced to its essence — a per-session fs-watch→notification bridge — leaving the file-locked store as the single coordination truth.

**What would flip it:** if `fs.watch` is too flaky to bridge reliably even with a `statSync` poll fallback, OR if the team wants peers reachable across machines (not in scope today) — then Candidate B's HTTP transport (extended to real network addressing) becomes necessary. If the channels research-preview API churns hard during the build, fall back to Candidate C and ship the ergonomics-only slice.

## Open questions (for the human at /spec)

1. **Project-local vs shipped — the load-bearing decision.** The existing `server.mjs`/`handlers.mjs` have a baseline-owned `obj/template/` mirror. Adding `enqueue_task` by editing those files would drift the shipped manifest/hashes and contradict the brief's "project-local, not shipped." **Spec must build the pool channel + `enqueue_task` as a SEPARATE project-local module** the local server composes in (or a standalone project-local channel server), never by editing the baseline-owned files. Confirm this boundary.
2. **Auto-join mechanism.** Channel-subprocess-writes-`sprint.json`-on-startup (direct fs) vs. the peer session calling `register_peer` as its first turn. The former is truly zero-command; the latter keeps all writes behind the MCP handler. Pick one.
3. **Deregistration (AC-6).** Add a `leave_peer` handler to the file-channel? On what signal — channel subprocess exit (it can write inactive on SIGTERM) or an explicit `/companion off`? Confirm scope.
4. **Permission relay** — do peers need `--dangerously-skip-permissions` to act unattended, or do we rely on permission relay / leave them attended? Trust-surface call for the security phase.
5. **Channel id / pool channel** — is the pool a well-known fixed id (e.g. `lobby`) or per-sprint? The brief leans `lobby`; confirm whether sprint work and ad-hoc handoff share one pool channel.
6. **Swarm coexistence** (carried from intake) — pool channel and lead-spawned swarm-worker dispatch stay fully separate, or share `sprint.peers[]`?
