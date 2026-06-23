# Re-architect sprint-mode coordination to an in-process broker over a Unix-domain socket

<!-- Intake — produced by /intake. Primary input: docs/brief/sprint-pool-broker-transport.md -->

## Problem

Sprint mode (the project-local multi-session prototype under `.claude/mcp/sprint-pool/` + `.claude/mcp/sprint-channel/`) coordinates a lead session and idle peer sessions through **shared JSON files** (`tasks.json`, `yields.json`) under a `channelRoot`, which every session's MCP server tails on a **750ms poll-watch loop**, pushing `notifications/claude/channel` events into its own session.

This only works while all sessions share **one** working tree. The direction sprint mode is headed is multi-session like a real dev team: each peer session **clones the repo into its own directory** and works **its own branch**, and the lead merges peer branches into main. At that point the mechanism breaks silently, because `channelRoot` is anchored to each session's `PROJECT_DIR`:

```
.claude/mcp/sprint-pool/server.mjs:25-27
  const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const STATE_ROOT  = join(PROJECT_DIR, '.claude', 'state', 'sprint');
```

Under clone-per-peer, every session has a different `PROJECT_DIR` → a different `channelRoot` → no shared `tasks.json`/`yields.json` → claims, yields, and done-signals **never cross sessions**. Concretely: a lead in `/work/main` enqueues a task; a peer in `/work/peerA` polls `/work/peerA/.claude/state/sprint/...` and sees nothing. The pool is dead the moment isolation is real.

The slice-C dogfood (this session) surfaced two further defects in the same mechanism — a re-dispatched task never re-notified the peer (a monotonic `seen`-set dedup that's never reset when a task leaves the claimable set), and `releaseTask` left the yield record `open` after re-dispatch. A narrow two-function fix was specced (`sprint-pool-redispatch-fix`) then **superseded**: fixing the poll-watch dedup is polishing a mechanism the target topology removes wholesale. Deferring the transposition as "more work" is a false economy — fix-the-symptom-now then rip-it-out-later costs more tokens and wall-clock than transposing once.

## Goal

Sprint-mode coordination works correctly across separate repo clones on one machine, via an event-driven broker rather than a shared-file poll loop.

## Non-goals

- **Cross-machine / network transport.** The broker uses a Unix-domain socket (single machine). TCP / network reach is a deliberate later step.
- **Peer authentication beyond filesystem socket permissions.** Trust model stays single-user-single-machine; no token/identity layer.
- **Touching baseline-owned files** outside the project-local `sprint-*` MCP directories. No manifest/build/count-cascade implications.
- **The `fs.watch`-vs-750ms micro-optimization.** The entire watch loop is being removed, not tuned.
- **New runtime dependencies.** `node:net` stdlib only — parity with the existing zero-dep coordination core.

## Success metrics

- **Cross-clone delivery** — baseline: 0 (broken; sessions in different clones never see each other's tasks), target: a task enqueued by the lead is delivered to a peer client in a different working directory, measured via: a two-process integration test pointing both at one `$SPRINT_BROKER_SOCK`.
- **Re-notify correctness** — baseline: re-dispatched task never re-fires (dedup bug), target: every claimable transition delivers exactly one event, measured via: broker dispatch unit tests (the bug class is structurally absent under event push).
- **Zero new deps** — baseline: 0 third-party runtime deps in the coordination core, target: 0 (node:net is stdlib), measured via: no `package.json` change for the sprint-* dirs.

## Stakeholders

- **Requester**: Tushar Srivastava (project owner; made the broker architectural call this session).
- **Reviewer**: Tushar Srivastava (gate-A `/approve-spec`, codesign decisions, gate-C `/grant-commit`).
- **Operator**: the human running sprint-mode dogfoods (launches lead + companion sessions via `launch.sh`).

## Constraints

- **Project-local, not shipped.** `.claude/mcp/sprint-pool/`, `.claude/mcp/sprint-channel/`, `launch.sh` — none are `owner: baseline`; consumer installs never receive them. Sprint mode is OFF by default (`velocity.sprint_mode.enabled`).
- **`node:net` stdlib only**, zero new runtime deps.
- **Reuse the existing coordination logic.** `handlers.mjs` (enqueue/claim/release/leave/signal_done/yield) + `store.mjs` move *inside* the broker as its in-process state layer; only the transport changes. The `mkdir` cross-process lock is no longer load-bearing once there's a single writer.
- **Shared rendezvous off the working tree.** The socket path must resolve from `$SPRINT_BROKER_SOCK` (an absolute path outside any clone), with a documented default; it cannot live under a per-clone `.claude/state/`.
- **Swarm-able decomposition.** Frame the work as separable components (NDJSON codec · broker state core · client adapter · lifecycle/discovery) so the implementation phase can route to swarm if the component graph supports it.

## Acceptance criteria

1. Given two sessions pointed at the same `$SPRINT_BROKER_SOCK` from **different** working directories, when the lead enqueues a task, then a peer client receives it, claims it single-winner, and `signal_done` unblocks its dependents — with **no shared `tasks.json`** between the two clones.
2. Given a peer yields an un-decidable task, when the lead releases (re-dispatches) it, then an idle peer receives the re-dispatch **event-driven** (no poll loop), and the re-notify-suppression bug does not occur.
3. Given the broker is the sole writer, when it restarts, then it recovers tasks/yields from a file-backed log, and no cross-process file race exists for coordination state.
4. Given NDJSON framing over the socket, when a chunk contains a partial line or multiple messages, then the codec reassembles correctly; a malformed line is rejected without killing the connection.
5. Given a peer process disconnects, when the broker detects the closed socket, then that peer is marked inactive; when the peer reconnects, it re-attaches without duplicating peer/task state.
6. Given the socket path resolves from `$SPRINT_BROKER_SOCK` (outside any clone) with a documented fallback default, when the broker transport ships, then the poll-watch loop and the edge-trigger dedup code paths are removed from the sprint-* servers.

## Open questions

- *(none — the broker direction and its non-goals are the requester's explicit decision; the load-bearing IPC sub-decisions, UDS-vs-alternatives, lifecycle ownership, and durability shape are captured in codesign at `/spec`, not left open here.)*
