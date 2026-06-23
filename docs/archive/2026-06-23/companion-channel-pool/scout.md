# Codebase Scout Report — companion-channel-pool

Scope: the companion peer mechanism, the sprint-channel MCP server it rides on, and the dispatch/peer-selection logic. Project-local prototype surface (none of this is baseline-owned/shipped). Read-only scout.

## Primary touchpoints

- `.claude/skills/companion/SKILL.md` — the current peer skill. `on/off/status` subcommands; hard-requires `<sprint_id>` (line ~35); runs the manual claim→execute→signal loop; documents that `off` cannot truly deregister (no channel leave tool). **The thing being decoupled + automated.**
- `.claude/mcp/sprint-channel/server.mjs` — MCP stdio server (Orchestration). `channelRoot(sprint_id)` resolves `.claude/state/sprint/<sprint_id>/` with `isSafeId` CWE-22 guard + `mkdirSync(recursive)` (so any id auto-creates a channel — the basis for a `lobby`/pool channel). Registers the 7 tools in the `TOOLS` array. **New tools (enqueue/leave) get added here + a handler.**
- `.claude/mcp/sprint-channel/handlers.mjs` — the 7 tool handlers (Domain): `registerPeer`, `sendMessage`, `broadcast`, `claimTask`, `signalDone`, `raiseConflict`, `yieldFork`. `registerPeer` upserts into `sprint.peers[]`; there is **no leave/deregister and no enqueue/add-task handler**. **The push-dispatch + pool-leave + enqueue logic lands here.**
- `.claude/mcp/sprint-channel/lib/store.mjs` — Foundation file-state: `readSprint/writeSprint` (`sprint.json`, holds `peers[]`), `readTasks/writeTasks` (`tasks.json`), `readYields/writeYields` (`yields.json`), `appendMailbox` (`mailbox.jsonl`, append-only). node:fs only, no deps.
- `.claude/mcp/sprint-channel/lib/safe-id.mjs` — `SAFE_ID = /^[A-Za-z0-9_-]+$/`, `isSafeId`. Every id that reaches a path goes through this. New ids (a `lobby` channel id, task ids from enqueue) must satisfy it.
- `.claude/mcp/sprint-channel/lib/lock.mjs` — `withLock` file-lock primitive used by `claimTask` for race-safe claims (the property AC-3 depends on).
- `.claude/skills/sprint-dispatch/peer-select.mjs` — `selectPeerClass(channelState)`: returns `'session'` if any peer has `pclass:'session'`, else `'worker'`. **The pool/preference concept already exists in embryo** — session peers are preferred when connected.
- `.claude/skills/sprint-dispatch/sprint-mode.mjs` — `isSprintModeEnabled(project)` reads `velocity.sprint_mode.enabled` (currently `true`).
- `.claude/skills/sprint-dispatch/yield-arbiter.mjs` — **grep found no exported symbols** (see Risks); the lead-side yield arbitration helper. Re-dispatch/release semantics (AC-5) relate here.

## Entry points that reach this code

- **MCP tool calls** from any session: `mcp__sprint-channel__{register_peer,claim_task,signal_done,yield_fork,raise_conflict,send_message,broadcast}` → `server.mjs` → `handlers.mjs`.
- **`/companion on|off|status`** (the skill) — the human-facing entry that drives the loop today.
- **`/sprint-dispatch`** skill — the lead-side dispatcher (selects peer class, dispatches slices).
- **Server registration**: NOT in committed `.mcp.json` (which has only context7/plantuml/playwright). `claude mcp list` shows `sprint-channel: node …/server.mjs ✔ Connected` — it's a **local/user-scoped MCP registration**. Channels, by contrast, are launched via `claude --channels plugin:<name>` (a different mechanism entirely — see research phase).

## Existing tests

- `tests/sprint-channel.test.mjs` — 13 tests, all passing. Covers each of the 7 handlers incl. re-register no-op, two-peer single-winner claim, unmet-dependency, signal-done unblock, non-claimer rejection, closed-enum message validation, broadcast count, yield plan_version increment, raise_conflict, and CWE-22 traversal rejection on claim/signal/register. **No coverage for enqueue or leave/deregister (don't exist yet).**
- `tests/sprint-dispatch.test.mjs` — 6 tests, passing (dispatch engine + peer selection).
- `tests/sprint-oracle.test.mjs` (8), `tests/sprint-plan-validate.test.mjs` (4) — passing; adjacent, unlikely to change.

## Constraints and co-changes

- `.claude/project.json → velocity.sprint_mode.enabled: true` — the gate that opens the sandbox fence. Must stay on for any of this to run.
- **Channel state tree** `.claude/state/sprint/<id>/` and **companion markers** `.claude/state/companion/<id>.json` are gitignored — never committed. New pool state lives here too.
- **No `obj/template/` mirror obligation** for this work: it's project-local, so unlike the earlier baseline-owned plan, there is no byte-equal mirror / manifest reconciliation. (The existing sprint-channel *is* mirrored under `obj/template/.claude/mcp/sprint-channel/` because slices A–C were baseline work — adding project-local tools to the live server while it has a shipped mirror is a consistency question for the spec: does the new tool ship or stay local?)
- **Channels are a separate launch path** (`--channels`, Bun, dev-flag) — not the local-MCP registration the channel currently uses. The research phase must pin how a custom channel plugin is structured and registered.

## Patterns in use here

Three-layer split is strict and worth matching: **Foundation** (`lib/*` — fs/lock/schema/safe-id, no deps), **Domain** (`handlers.mjs` — pure functions taking `{channelRoot, ...}`, returning result objects, no SDK), **Orchestration** (`server.mjs` — the only SDK importer, resolves channelRoot + delegates). Handlers are pure and individually unit-tested with a temp `channelRoot`. Every external id passes `isSafeId` before touching a path. New work should preserve this: push/enqueue/leave logic as pure handlers, transport (channel plugin) as a separate orchestration layer.

## Risks / landmines

- **`yield-arbiter.mjs` exports nothing detectable** — grep for `export (function|const)` returned empty. Either the file is a stub/placeholder, uses a non-standard export form, or arbitration is currently done ad-hoc (consistent with us hand-editing JSON live). Verify its real contents in research/spec before assuming a re-dispatch API exists; AC-5 (arbitrate without hand-editing) may be building this largely from scratch.
- **Channel ≠ the MCP "channels" feature.** Our `sprint-channel` is a polling MCP store; Claude Code "channels" are a push-event bridge launched with `--channels`. The names collide; the spec must be explicit about which "channel" each sentence means, or the implementation will conflate them.
- **Shipped mirror vs project-local tension.** The live `server.mjs`/`handlers.mjs` have an `obj/template/` mirror (baseline-owned, shipped). Adding project-local-only tools to that same file risks manifest/hash drift on the baseline-owned copy. Spec must decide: extend the shipped server (then it's baseline work, not project-local) vs. a separate project-local module the local server composes in. **This contradicts the brief's "project-local, not shipped" stance and needs resolving at spec time.**
- **No deregister today** — `registerPeer` only upserts; `sprint.peers[]` grows monotonically. AC-6 (leave path) is genuinely new behavior, not a tweak.
- **Push delivery is unproven here** — nothing in the current channel pushes; peers poll. The push path is entirely net-new and depends on the channels-reference protocol (research phase).
