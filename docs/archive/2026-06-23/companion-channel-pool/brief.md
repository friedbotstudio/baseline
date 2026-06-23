# Brief — companion-channel-pool

> PM-mode requirement capture (brainstorm Stage 3 output). Primary input for `/intake`.
> Scope: **project-local dogfooding scaffolding** — not baseline-owned, not shipped to consumers.

## Actor

The **lead** Claude Code session, **N human-launched peer sessions** (companions), and the **human operator** who launches the peer terminals.

## Trigger

When the operator runs several peer sessions at once (≈5) to parallelize sprint work across companions.

## Current state

Each peer must manually run `/companion on <sprint_id>` and then **poll** the channel's `tasks.json` in a loop to find a claimable task. The lead arbitrates an un-decidable fork (a peer `yield_fork`) by **hand-editing the channel state files** (`tasks.json`/`yields.json`). Babysitting N terminals this way — manual join + polling + manual arbitration — is unusable past one or two peers. (Confirmed live: a two-session handoff worked, but every step was manual.)

## Desired state

- Peer sessions **join the pool automatically when launched** — no manual `/companion on`, no polling.
- Peers **receive work by push** rather than discovering it by reading state on a loop.
- Peers **escalate un-decidable forks to the lead by push**, and the lead **arbitrates and re-dispatches without hand-editing** channel state.
- The **bounded-executor contract is preserved**: a peer still executes a fully-specified recipe within its `write_set` and yields every decision the recipe doesn't settle — it never decides.

## Non-goals

1. **No auto-spawning of peer sessions.** A human (or a launch script) still starts each terminal; the work only makes already-launched peers useful — it does not spawn processes.
2. **Peers never make decisions.** The bounded-executor contract (yield-everything) stays; this is an explicit earlier decision, recorded here as binding.
3. **Scope is project-local prototype** — not baseline-owned, excluded from `audit-baseline`/manifest, not shipped to consumers; free to be reworked or removed once the pattern settles (same posture as the existing `companion` skill).

## Solution leakage (noted, not committed)

The request named specific solution shapes: a **custom Bun Claude Code channel plugin**, **push-dispatch**, a **`lobby` default channel**, an **`enqueue_task` primitive**, and a **session pool**. These are captured as the engineer's leanings, not as committed design. The underlying need is: **auto-join + push-pickup + push-escalation that stays usable as peer count grows**, with the lead as sole decision locus.

## Open questions

- **Cross-machine / remote peers** — in scope? The current channel is a single-machine shared on-disk directory; the operator did not mark cross-machine as a non-goal, so it is unresolved rather than excluded.
- **Swarm-path interaction** — does this addition coexist with, or in any way replace, the existing lead-spawned `swarm-worker` dispatch? Not marked a non-goal; needs an explicit scope line in intake/spec.
- **Scale threshold** — what target peer count defines "working at scale" (the success bar), and what's the acceptable per-peer dispatch latency under push?
