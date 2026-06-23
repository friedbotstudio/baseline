---
name: companion
description: Project-local helper to join/leave a sprint-channel as a session peer for sprint-mode dogfooding. `/companion on <sprint_id> [peer_id]` registers this Claude Code session as a `pclass:"session"` peer and works the claim → execute → signal loop, yielding un-decidable forks to the lead (never deciding). `/companion off` stops the loop and marks the local peer inactive. `/companion status` reports the current peer/sprint. NOT baseline-owned, NOT shipped to consumers — throwaway tooling for the slice-C sprint-mode prototype. Use when a human launches a second session to act as a companion peer during a sprint dogfood.
---

# companion — be a session peer on the sprint channel

This is a **project-local prototype tool** (no `owner: baseline`; out of scope of `audit-baseline`). It turns the current Claude Code session into a **session peer** on a sprint-mode coordination channel so a sprint can be dogfooded with a real human-launched peer instead of lead-spawned swarm-worker subagents.

It exists to make the dogfood ergonomic — instead of pasting the `register_peer` / `claim_task` / `signal_done` instructions by hand, you type `/companion on <sprint_id>`.

## The bounded-peer contract (Article II — non-negotiable)

A session peer is a **recipe-executor, not a decision-maker**. When acting as a companion you SHALL:

- **Stay a peer.** You are a peer on this channel and you remain one for the whole session, even if you (or the same human) also run the workflow-lead session elsewhere. You SHALL NOT arbitrate yields, release or re-dispatch tasks, answer other peers, or **decline a claimable lane on the belief that you are the lead**. If a lane is claimable and yours to take (no assignee, or assigned to you), take it. (Dogfood finding: a peer that believed it was "the lead" declined a claimable lane and starved the queue.)
- **Know who you are.** You are the exact `peer_id` you registered as, and no other peer. Never infer your identity from a task push — a `task-available` for a lane assigned to a different peer is not yours, and a rejected claim does not mean you should change who you are. Claim only a lane with no assignee or assigned to your own `peer_id`. (Dogfood finding: a peer assumed it was `peer-1` and only discovered it was `peer-2` when a directed claim was rejected.)
- Execute the claimed task's recipe **within its declared `write_set`** only.
- On any **un-decidable fork** — a design, scope, abstraction, or naming choice the recipe does not settle — call `yield_fork(sprint_id, peer_id, task_id, fork_desc)` and **stop work on that task**. You do NOT guess, and you do NOT make the call yourself. The lead arbitrates in main context and re-dispatches.
- On a **write-set clash** with another peer's path, call `raise_conflict(...)` and let the lead arbitrate.
- Never send a free-form directive over the channel — the only messages are the mechanical ones the 7 tools expose.

This is the sandbox fence that keeps the lead the sole decision locus. Breaking it defeats the whole point of the prototype.

## Prerequisites

1. **The `sprint-channel` MCP server is loaded in this session.** Verify the tools are present (the session was started *after* the server was registered). If the `register_peer` / `claim_task` / … tools are not available, stop and tell the user to restart this session (`claude mcp list` should show `sprint-channel … ✔ Connected`).
2. **Same repo, same machine as the lead.** The channel is a shared on-disk directory (`.claude/state/sprint/<sprint_id>/`), file-locked. A peer in a different repo or on another machine cannot see it.
3. **Sprint mode is on** for this repo (`velocity.sprint_mode.enabled` in `.claude/project.json`). If off, stop — the sandbox fence is closed.

## Subcommands

Parse the argument string. The first token is the subcommand (`on` | `off` | `status`).

### `/companion on <sprint_id> [peer_id]`

1. Require `<sprint_id>` (kebab/alphanumeric — it must satisfy the channel's `isSafeId`). If absent, stop and ask for it.
2. Choose `peer_id`: use the second token if given, else default to `companion-1`. It must also be a safe id.
3. Call the MCP tool `register_peer` with `{ sprint_id, peer_id, pclass: "session", role: "peer", workspace: "." }`. Confirm `{ ok: true, registered: true }`.
4. Write the local marker `.claude/state/companion/<sprint_id>.json` (create the dir if missing) with:
   ```json
   { "sprint_id": "<sprint_id>", "peer_id": "<peer_id>", "pclass": "session", "active": true, "registered_at": <epoch> }
   ```
   This marker is how `off` / `status` find the active peer. The `.claude/state/` tree is gitignored — the marker is never committed.
5. Enter the **claim loop**:
   - Call `claim_task({ sprint_id, peer_id, task_id })` for an available task. To discover task ids, read `.claude/state/sprint/<sprint_id>/tasks.json` and pick a `pending` task whose `depends_on` are all `done` (the handler re-checks atomically, so a lost race just returns `claimed: false` — move to the next).
   - On a successful claim, **execute that task's recipe** within its `write_set`. The recipe comes from the task definition and any `send_message` the lead addressed to this peer (read the mailbox). Apply `code-structure` discipline; all 25 PreToolUse hooks fire on your writes exactly as normal.
   - On completion call `signal_done({ sprint_id, peer_id, task_id })`; report the `unblocked` list it returns.
   - On an un-decidable fork → `yield_fork(...)` and stop that task (see the contract above).
   - Repeat until no claimable task remains, then report "no claimable tasks; idle" and stop (the session stays registered as active so the lead can dispatch more).
6. Report what you claimed, finished, and yielded.

### `/companion off [sprint_id]`

1. Resolve the marker: the given `<sprint_id>`, or the single active marker under `.claude/state/companion/` if only one exists (otherwise ask which).
2. Stop the claim loop. Do not claim anything further.
3. Mark the peer inactive: set `"active": false` in the marker.
4. **Honest limitation:** the channel has **no deregister/leave tool** (`register_peer` only adds/updates a peer record). So `off` cannot remove this peer from `sprint.peers[]` on the channel — it can only stop this session from working and flag the local marker inactive. The lead may still see the peer listed. *(Adding a `leave_peer` / `deregister_peer` tool to the channel is the clean fix — surface it as a backlog item if the dogfood confirms it matters. This is exactly the kind of gap the prototype is meant to expose.)*
5. Report: peer marked inactive locally; note the deregister limitation.

### `/companion status`

Read any markers under `.claude/state/companion/`. For each, report `sprint_id`, `peer_id`, `active`, and `registered_at`. If none, report "no companion peer registered in this session."

## Constraints

- **Bounded execution only** — re-read the Article II contract above. A companion never makes a design decision; it yields.
- **No channel deregister exists yet** — `off` is best-effort local (mark-inactive + stop). Don't claim it removed the peer from the channel.
- **This skill is not baseline-owned** — it carries no `owner: baseline`, is excluded from `audit-baseline`, and is not shipped to consumers. It is prototype tooling for the sprint-mode dogfood and may be reworked or removed once the §II.B charter (slice E) settles the real pattern.

## Channel-pool mode (push-dispatch, no polling)

The manual `on/off/status` flow above is the **polling** path: you type the join command and the session reads `tasks.json` on a loop. For running several peers at once, prefer the **pool channel** — a project-local Claude Code *channel* (`.claude/mcp/sprint-pool/`) that auto-registers the peer on launch and **pushes** work in, so the session never polls.

The pool channel's transport is an **in-process broker over a Unix-domain socket** (`.claude/mcp/sprint-broker/`): the lead session hosts the broker (sole writer of coordination state) and every peer connects to it as a client, so claims/yields/done-signals cross sessions over the socket — not a shared file. This works even when peers run from **separate repo clones** (the rendezvous is `$SPRINT_BROKER_SOCK`, a short path outside any clone; `launch.sh` sets it, defaulting under the XDG runtime dir / `TMPDIR`). There is no 750ms watch loop — delivery is event-native.

**Launch a pool peer** (one terminal per peer; the channel is custom so it needs the dev flag):

```
SPRINT_POOL_PEER_ID=peer-2 claude --dangerously-load-development-channels server:sprint-pool
```

- On startup the channel registers a `session` peer on the `lobby` channel (override with `SPRINT_POOL_CHANNEL`) — **no `/companion on` needed** — provided `velocity.sprint_mode.enabled` is true; otherwise it refuses to start.
- The lead hands work over by calling the `enqueue_task` tool; the broker pushes a `task-available` event to peer clients and a peer claims via the existing `claim_task`. An un-decidable fork still goes through `yield_fork` (bounded-executor contract unchanged); the broker delivers the `yield` to the lead, and the lead re-dispatches with `release_task` (which also resolves the yield) — no hand-editing of channel state.
- **Launch the lead** with `SPRINT_POOL_ROLE=lead` so this session hosts the broker and receives yield escalations.
- Closing the terminal (SIGTERM) marks the peer inactive; or call `leave_peer`.

Prerequisites and the bounded-peer contract above apply identically. Peers run **attended** — normal permission prompts still gate their tool use (no `--dangerously-skip-permissions`).
