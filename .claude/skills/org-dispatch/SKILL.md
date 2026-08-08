---
name: org-dispatch
owner: baseline
description: Run an org-team workflow — a flat pod of up to four peer Claude Code sessions claims lane-tagged slices of an approved spec over the MCP broker pool and implements them concurrently. Each peer DECIDES its own in-lane implementation choices in its own main context (Article X); only un-decidable or cross-lane forks escalate peer→lead→human (yield_fork for task-bound forks, ask_lead for free-form queries). Opt-in and OFF by default (velocity.org_mode.enabled). Graduates the retired sprint-dispatch prototype into the constitutionally-sanctioned org-team model (Article X — Multi-session coordinated workflows). Requires git.
---

# org-dispatch — run an org-team over the coordination channel

`org-dispatch` is the execution engine of the **org-team model**: a flat pod of up to four peer Claude Code sessions claims lane-tagged slices of an approved spec and implements them concurrently over the MCP broker pool, so per-feature wall-clock approaches the slowest lane instead of the sum. It is the multi-session counterpart to `swarm-dispatch` (which parallelizes components of one spec inside one session via bounded subagents).

It is governed by **Article X — Multi-session coordinated workflows** (a different axis from Article II, which governs intra-session delegation and is untouched). The load-bearing difference from the retired `sprint-dispatch` sandbox: **a peer decides its own in-lane implementation choices in its own main context** — it does not bounce every fork to the lead. Only un-decidable or cross-lane forks escalate.

## Gate: opt-in, off by default, git required

```
node .claude/skills/org-dispatch/org-mode.mjs gate   # wraps org-mode.mjs -> orgDispatchGate
```

If the gate refuses, **stop** — org mode is the opt-in fence (and worktree isolation requires git).

## The run loop (lead, in main context)

1. **Decompose into lanes.** Read the approved spec and its dependency DAG. Each lane is one channel task `{id, lane, write_set, depends_on, assignee?}` (`org-mode.toLaneTasks`). Write the tasks into the channel state and a durable plan (`harness/plan-store.createPlan`). A lane carries a domain tag the claiming peer inherits — its in-lane decision latitude. **No sprint manifest is required**: a lane is just a fully-specified task. The lead may also `enqueue_task` ad-hoc lanes at any time — peers can be handed tasks with no sprint in place; the pool is enabled by `velocity.org_mode.enabled` alone.
2. **Allocate: claim-any or directed.** Leave a lane's `assignee` unset for **claim-any** (the first free peer wins) — simplest, but one fast peer can monopolize the queue while others idle. Set `assignee` to a `peer_id` for a **directed** lane that only that peer may claim — this is the lead's control to spread load across the pod or hand a specific lane to a named peer. `claim_task` enforces it server-side (a non-assignee claim is rejected); the `task-available` push carries the assignee so a well-behaved peer skips a lane that is not its own.
3. **Select the pod** (`peer-select.selectPeerClass`): if human-launched peer sessions are registered on the channel, the flat pod (up to four) works the lanes; otherwise the lead spawns bounded `swarm-worker` subagents as the fallback execution surface. The lead is one of the four — flat for claiming, plus the arbitration + human-escalation hat.
4. **Coordinate mid-flight.** Peers `claim_task` (race-safe, single-winner), implement within their lane's `write_set`, `signal_done` to unblock dependents (pipeline, not a wave barrier).
   - **A peer is always a peer, and knows which peer it is.** A session connected as a peer never adopts the lead role and never declines a claimable lane on the belief that it is the lead, even if the same human also runs the workflow-lead session. The pool server bakes the session's `peer_id` and role into its instructions so it never guesses its identity.
   - **Completion is reliable, not push-only.** The lead is pushed `task-claimed` / `task-done` and, when the last lane drains, `all-done`. Pushes are lossy hints, so when waiting the lead reconciles via `sprint_status` — its `all_done` flag is the authoritative, never-dropped completion check.
5. **In-lane decisions stay local.** A peer that meets an in-lane implementation choice (`classifyFork` → `decide`) decides it in its own main context and proceeds. It does NOT escalate routine implementation latitude.
6. **Escalation spine (peer→lead→human).** A peer that meets an un-decidable or cross-lane fork (`classifyFork` → `escalate`) escalates rather than guessing:
   - a **task-bound** un-decidable fork → `yield_fork(task_id, fork_desc)` (the lead records it via `yield-arbiter.recordYield`, arbitrates in main context, records the resolution, and re-dispatches);
   - a **free-form** question → `ask_lead(body)` (the broker pushes `peer-message` to the lead). The lead arbitrates in main context, and if the fork needs human judgment it escalates to the **human**, then routes the decision back with `answer_peer(message_id, answer)`.
7. **Round boundary.** When a wave of independent lanes completes, the lead commits between rounds so a dependent round forks from fresh HEAD.

## Constraints (what makes this constitutional — Article X)

- **Peers decide in-lane; they escalate out-of-lane.** A peer is a full Claude Code session = its own main context, so its in-lane implementation decisions are Article-II-internal to that session. A cross-lane or un-decidable fork escalates — never a guess across lanes.
- **The human is the final authority.** The escalation chain is peer→lead→human; consent gates (approve-spec / approve-swarm / grant-commit) stay structural and un-forgeable. No peer or lead path bypasses or self-satisfies a gate.
- **No new subagent.** Peers are sessions, not subagents; `swarm-worker` remains the only declared subagent. Each peer session may itself run its own subagents — a per-session property, orthogonal to this charter.
- **Live hooks govern every peer write.** The PreToolUse guards fire on peer writes exactly as for any session.
- **Off by default, git required.** `velocity.org_mode.enabled` is the fence; worktree isolation requires git.

## The live channel

The broker pool runs over the project's MCP servers (the in-process broker on a Unix-domain socket; peers attach as clients). Peer tools: `claim_task`, `signal_done`, `yield_fork`, `ask_lead`; lead tools: `enqueue_task`, `release_task`, `answer_peer`, `sprint_status`. The free-form `ask_lead`/`answer_peer` pair is the peer→lead→human escalation channel; `sprint_status` is the lossless source of truth (reconcile from it rather than trusting individual pushed events).

## Relationship to other tracks

- **swarm-dispatch** parallelizes components of one spec inside one session (bounded subagents, worktrees).
- **org-dispatch** parallelizes lanes of one spec across multiple peer sessions (the flat pod).
- The default 11-phase solo/swarm pipeline is unchanged; `org` is an added selectable track.
