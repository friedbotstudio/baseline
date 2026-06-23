# Make companion peers auto-join a pool and pick up pushed work, escalating to the lead — usable at multi-peer scale

<!--
Intake document. Produced by the `intake` skill.
Primary input: docs/brief/companion-channel-pool.md
Scope: project-local dogfooding scaffolding — NOT baseline-owned, NOT shipped to consumers.
-->

## Problem

Companion peers today are unusable past one or two sessions. Each peer must manually run `/companion on <sprint_id>` and then **poll** the channel's `tasks.json` in a loop to find claimable work; when a peer hits an un-decidable fork and `yield_fork`s, the lead arbitrates by **hand-editing the channel state files** (`tasks.json`/`yields.json`) — exactly what we did live this session (reset `status`→`pending`, clear `claimed_by`).

Concretely: an operator who wants ~5 companion sessions working a sprint must, per terminal, type the join command, then watch each session poll, then hand-edit JSON every time one yields. The babysitting cost grows linearly with peer count, so the mechanism that works for a 2-session demo collapses at 5.

## Goal

A pool of human-launched peer sessions where each peer joins automatically on launch, receives work by push, and escalates un-decidable forks to the lead by push — and the lead arbitrates and re-dispatches without ever hand-editing channel state — all while peers stay bounded recipe-executors that never decide.

## Non-goals

- **No auto-spawning of peer sessions.** A human or a launch script still starts each terminal; this work only makes already-launched peers useful — it does not spawn processes.
- **Peers never make decisions.** The bounded-executor contract (yield every un-settled choice to the lead) stays binding; this is not an autonomy expansion.
- **Not shipped to consumers.** This is project-local prototype scaffolding (same posture as the existing `companion` skill) — excluded from `audit-baseline`/manifest, free to be reworked or removed once the pattern settles.
- **Not a swarm-path rewrite.** It does not replace the lead-spawned `swarm-worker` dispatch (see Open questions for the coexistence boundary).

## Success metrics

- Manual steps to bring a peer online — baseline: 1 join command + continuous polling per peer; target: **0** (launch is the only operator action), measured via: the launch path performing registration with no `/companion on`.
- Operator hand-edits to arbitrate a yield — baseline: ≥1 JSON edit per yield; target: **0**, measured via: arbitration/re-dispatch happening through a tool/command path, not a file edit.
- Peers usable concurrently — baseline: ~2 before babysitting dominates; target: **≈5** with each independent task claimed exactly once, measured via: a multi-peer run with no double-claims and all tasks completing.
- Work pickup mechanism — baseline: poll loop; target: **push** (peer reacts to a delivered event), measured via: peers idle without polling until a unit of work is delivered.

## Stakeholders

- **Requester**: Tushar Srivastava (razieldecarte@gmail.com) — baseline maintainer, dogfooding sprint mode.
- **Reviewer**: Tushar Srivastava — sole reviewer (solo project).
- **Operator** (who runs it): Tushar Srivastava — launches the lead + peer terminals on one machine.

## Constraints

- **Single machine, same repo.** The coordination channel is a shared on-disk directory (`.claude/state/sprint/<id>/`), file-locked; peers must be co-located (cross-machine is an open question, not yet in scope).
- **Claude Code channels are a research preview.** Requires Claude Code ≥ 2.1.80 (have 2.1.186 ✓) and claude.ai/Console auth (✓ — not Bedrock/Vertex). The `--channels` flag/protocol may change.
- **Custom channel ⇒ dev flag.** A project-local channel plugin is not on Anthropic's allowlist, so peers must launch with `--dangerously-load-development-channels` (or an org `allowedChannelPlugins` entry). This is a trust-surface decision for the security phase.
- **Bun required.** Channel plugins are Bun scripts; Bun is not currently installed.
- **Article II preserved.** The lead remains the sole decision locus; the transport must not let a peer decide. Push-dispatch and push-escalation are mechanical only.
- **Project-local.** No `owner: baseline`; must not enter the manifest or be shipped.

## Acceptance criteria

1. Given a peer terminal launched into the pool, when the session starts, then it is registered as a `session` peer on the channel **without the operator running `/companion on`** (auto-join).
2. Given the lead has a fully-specified unit of work and ≥1 idle pooled peer, when the lead dispatches it, then an idle peer **receives it by push** (no polling loop) and claims it through the existing race-safe `claim_task`.
3. Given N peers (N ≈ 5) in the pool and M independent units of work dispatched, when they run, then **each unit is claimed by exactly one peer** (no double-claim) and all complete.
4. Given a peer reaches an un-decidable fork, when it yields, then the lead is **notified by push** and the peer **stops work on that task without deciding** (bounded contract holds; nothing written outside `write_set`).
5. Given the lead arbitrates a yielded fork, when it re-dispatches the settled recipe, then the peer **receives the update and executes it — with no operator hand-edit** of `tasks.json`/`yields.json`.
6. Given a peer leaves the pool (session closed or `off`), when the lead next inspects the pool, then the peer is reflected as inactive/removed (a real leave path, closing the gap the current `off` documents as unsupported).

## Open questions

- **Cross-machine / remote peers** — in scope, or an explicit non-goal? Current channel is single-machine on-disk; the operator did not mark cross-machine off-limits.
- **Swarm-path coexistence** — exact boundary between this human-launched pool and the existing lead-spawned `swarm-worker` dispatch: do they share the channel, or stay fully separate?
- **Scale threshold + latency target** — what peer count is the success bar (≈5 assumed), and what per-peer push-dispatch latency is acceptable?
- **Deregistration semantics** — the channel currently has no `leave_peer`/`deregister` tool (AC-6 implies adding one); confirm that's in scope here vs. a separate change.
