# Codebase Scout Report — sprint-pool broker transport

Scope: the project-local sprint-mode coordination stack and the boundary between it and the baseline-owned channel core. Intake: `docs/intake/sprint-pool-broker-transport.md`.

## Ownership boundary (load-bearing — drives the whole design)

`obj/template/.claude/manifest.json` is the oracle:

- **BASELINE-OWNED — must NOT be edited** (6 files in the manifest; any edit ⇒ manifest drift ⇒ `audit-baseline` FAIL + rebuild tax):
  - `.claude/mcp/sprint-channel/server.mjs` — SDK stdio wrapper exposing the 7 channel tools (`register_peer`, `send_message`, `broadcast`, `claim_task`, `signal_done`, `raise_conflict`, `yield_fork`).
  - `.claude/mcp/sprint-channel/handlers.mjs` — the 7 tool handlers (`{channelRoot, ...} → result`), SDK-free.
  - `.claude/mcp/sprint-channel/lib/store.mjs` — `read/writeSprint`, `read/writeTasks`, `read/writeYields`, `appendMailbox`.
  - `.claude/mcp/sprint-channel/lib/lock.mjs` — `withLock` (atomic mkdir lock).
  - `.claude/mcp/sprint-channel/lib/safe-id.mjs` — `isSafeId` / `SAFE_ID` (CWE-22 guard).
  - `.claude/mcp/sprint-channel/lib/schema.mjs` — `validateMessage`.
- **PROJECT-LOCAL — editable, NOT shipped** (0 manifest files):
  - `.claude/mcp/sprint-pool/server.mjs` — pool MCP server: channelRoot resolution, auto-register, the **watch loop** (`startWatchLoop` + `pollOnce`), and the `enqueue_task`/`leave_peer`/`release_task` tools.
  - `.claude/mcp/sprint-pool/handlers.mjs` — pool handlers `enqueueTask`, `registerPoolPeer`, `leavePeer`, `releaseTask`.
  - `.claude/mcp/sprint-pool/watcher.mjs` — `pollOnce` change-detector (**to be removed** under the broker).
  - `.claude/mcp/sprint-pool/registrar.mjs` — startup auto-join (`runRegistration` → `registerPoolPeer`, gated on `sprint_mode`).
  - `.claude/skills/companion/launch.sh` + `SKILL.md`, `.claude/skills/sprint-dispatch/**` — launch + dogfood tooling.

**Design consequence:** the broker is **new project-local code** (e.g. a `sprint-broker/` dir or files under `sprint-pool/`). It **imports baseline `handlers.mjs` + `store.mjs` read-only** and calls them against its own single `channelRoot`. The peer-side forwarding lives in the **project-local** `sprint-pool` server, never in baseline `sprint-channel`.

## Primary touchpoints

- `.claude/mcp/sprint-pool/server.mjs:15-37` — `STATE_ROOT = join(PROJECT_DIR, '.claude','state','sprint')` + `channelRoot()`. **The root defect**: channelRoot anchored per-session. The broker socket rendezvous + sole-writer state must replace this.
- `.claude/mcp/sprint-pool/server.mjs:96-110` — `startWatchLoop` / `pollOnce` interval (750ms `SPRINT_POOL_POLL_MS`). **Removed** under event-push.
- `.claude/mcp/sprint-pool/server.mjs:39-65` — the `enqueue_task`/`leave_peer`/`release_task` TOOLS array; these become broker-forwarded calls.
- `.claude/mcp/sprint-pool/server.mjs:114-135` — startup block: `SPRINT_POOL_ACTIVE=1` gates registration + watch loop; this is where broker host-vs-client branching lands.
- `.claude/mcp/sprint-pool/watcher.mjs` (whole file) — **deleted**; its `claimableTasks`/`emitOnce` logic is subsumed by broker push.
- `.claude/mcp/sprint-pool/handlers.mjs:46-67` — `releaseTask` (carries the unresolved-yield bug); its logic moves into the broker, preserved + corrected.
- `.claude/mcp/sprint-channel/handlers.mjs` (read-only reuse) — `claimTask:42`, `signalDone:68`, `yieldFork:94`, `registerPeer:15` are the in-process state ops the broker invokes against its own channelRoot.
- `.claude/mcp/sprint-channel/lib/store.mjs` (read-only reuse) — the broker's file-backed durability layer (sole writer).
- `.claude/skills/companion/launch.sh:54-63` — env export block (`SPRINT_POOL_ACTIVE/CHANNEL/ROLE/PEER_ID`). **Where `$SPRINT_BROKER_SOCK` gets wired** (set to an absolute path outside any clone).

## Entry points that reach this code

- `launch.sh` → `claude … --dangerously-load-development-channels server:sprint-pool` — spawns lead (`role=lead`, `peer_id=lead`) or peer (`--peer [id]`). Sets `SPRINT_POOL_ACTIVE=1`.
- The pool MCP server boots (`server.mjs:114`), and when `SPRINT_POOL_ACTIVE=1` runs `runRegistration` + `startWatchLoop`. **This is the seam** the broker host/client split replaces.
- MCP registration is **NOT in `.mcp.json`** — the server is loaded by name via the `server:sprint-pool` channel flag (and `claude mcp add sprint-pool` in the dogfood). So **no `.mcp.json` change is needed** (and adding one would trigger the avoided 3→4 count cascade).

## Existing tests

- `tests/sprint-pool-handlers.test.mjs` — enqueue/register/leave/release + single-winner claim through the re-dispatch path. Pattern: real temp `channelRoot` via `mkdtempSync`, JSON fixtures, **no mocks**. Passing.
- `tests/sprint-pool-watcher.test.mjs` — `pollOnce` task-available / yield emission + dedup. Passing. **Will be deleted/rewritten** with the watch loop.
- `tests/sprint-channel.test.mjs` — baseline 7-handler coverage (claim/done/yield/etc.). Passing. **Must stay green** (baseline contract unchanged).
- `tests/sprint-dispatch.test.mjs`, `tests/sprint-oracle.test.mjs`, `tests/sprint-plan-validate.test.mjs` — adjacent sprint machinery; not touched, must stay green.

New broker tests follow the same no-mock discipline: a **real UDS socket pair** (server + client over `node:net`), temp channelRoot for the file-backed log. Per Art. VI.3 the socket/transport is not an internal-module mock — it's the real thing.

## Constraints and co-changes

- **`velocity.sprint_mode.enabled` is `true`** in `project.json` right now (flipped on for the dogfood) — intake's "off by default" is the shipped default, NOT this repo's current state. Tests must not assume it's off; `registrar`/broker gate on it.
- **Zero new deps**: `node:net` is stdlib; no `package.json` change for the sprint-* dirs.
- **No `.mcp.json` / no manifest / no count-cascade**: broker is project-local; nothing ships.
- **`$SPRINT_BROKER_SOCK`** must be an absolute path **outside any clone**; `launch.sh` sets it for lead + peers. Documented fallback default needed (AC-6).
- **Baseline files frozen**: the design must achieve reuse by import, not edit. If research finds a real need to change a baseline handler, that's a separate baseline workflow — flag, don't do it here.

## Patterns in use here

Layered + zero-dep: `Foundation` (store/lock/safe-id/schema) ← `Domain` (handlers, pure `{channelRoot,...}→result`) ← `Orchestration` (server.mjs, the only SDK importer). Pool mirrors channel exactly (project-local handlers compose the same Foundation). Channel push today rides `notifications/claude/channel` (server→own-session pipe). The broker keeps that last-mile pipe per session and replaces only the **cross-session** mechanism (files+poll → socket+push).

## Risks / landmines

- **Baseline-edit trap**: `sprint-channel/server.mjs:15` has the *same* PROJECT_DIR-anchored channelRoot, but it's baseline-owned. The broker must not require editing it — peer forwarding is project-local. Touching any sprint-channel file ⇒ audit FAIL + rebuild tax ([[baseline-skill-edit-needs-manifest-rebuild]]).
- **UDS path length cap** (~104 chars on macOS, ~108 on Linux) — `$SPRINT_BROKER_SOCK` under a deep clone path can exceed it; research must pick a short rendezvous (e.g. `$TMPDIR`/XDG runtime dir), not a path inside the repo.
- **Stale-lock-on-death backlog item** (`sprint-channel-lock-stale-ttl-recovery`) is **mooted** for coordination by the single-writer broker (no cross-process mkdir lock in the hot path) — note at memory-flush; don't separately fix it here.
- **`withLock` still called** inside reused baseline `claimTask` — harmless in-process (broker's own channelRoot), but means the broker dir hosts transient `.lock-*` dirs; ensure the file-backed log dir is the broker's, not a clone's.
- **`Date.now()`** is used in baseline handlers (`raiseConflict`, `yieldFork` via mailbox) — fine at runtime; only a constraint inside Workflow scripts, not here.
- **Companion/dogfood state** already on disk at `.claude/state/sprint/lobby/` (tasks/yields/sprint.json) from this session — the broker's file-backed log should target a broker-owned path; reconcile or ignore the stale lobby state.
- **Two MCP servers, one channel name**: both `sprint-channel` and `sprint-pool` exist; the broker work centers on `sprint-pool` (project-local). Keep the baseline `sprint-channel` server functioning as-is for any direct-tool callers.
