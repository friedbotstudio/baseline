---
name: sprint-dispatch
owner: baseline
description: Run a sprint — dispatch a sprint's independent slices to channel peers (human-launched Claude Code sessions when connected, else lead-spawned bounded swarm-worker subagents) that coordinate mid-flight over the baseline-owned MCP channel (claim/done-unblock/conflict), with a RALPH stop-rule (a peer yields an un-decidable fork to the lead, who arbitrates in main context and re-dispatches). Opt-in and OFF by default (velocity.sprint_mode.enabled). Slice C of the sprint-mode epic — the throwaway-able prototype that gates the §II.B charter. Workers stay bounded; the channel carries only mechanical coordination; the lead is the sole decision locus (Article II preserved).
---

# sprint-dispatch — run a sprint over the coordination channel

`sprint-dispatch` is the execution engine of sprint mode: the lead decomposes a sprint into independent slices and dispatches them to **channel peers** that coordinate themselves mid-flight, so wall-clock approaches the slowest slice instead of the sum. It is the parallel-at-the-sprint-level counterpart to `swarm-dispatch` (which parallelizes components of one spec). This is a **sandboxed prototype** (slice C) — its purpose is to prove the channel keeps workers bounded and governable before the §II.B charter (slice E) formalizes the pattern.

## Gate: opt-in, off by default

```
node -e "import('./.claude/skills/sprint-dispatch/sprint-mode.mjs').then(async m => { const fs = await import('node:fs'); const p = JSON.parse(fs.readFileSync('.claude/project.json','utf8')); if (!m.isSprintModeEnabled(p)) { console.error('sprint mode is OFF (velocity.sprint_mode.enabled). Refusing.'); process.exit(1);} console.log('sprint mode ON'); })"
```

If sprint mode is off, **stop** — this is the sandbox fence. Never run a sprint without the explicit flag.

## The run loop (lead, in main context)

1. **Decompose.** Read the sprint manifest (`sprint-plan`) and the dependency DAG. Each sprint slice is one channel task `{id, write_set, depends_on}`. Write the tasks into the channel state (`.claude/state/sprint/<sprint_id>/tasks.json`) and a durable plan (`harness/plan-store.createPlan`).
2. **Select peer class** (`peer-select.selectPeerClass`): if human-launched Claude Code sessions are registered on the channel, use them as peers; otherwise spawn bounded `swarm-worker` subagents (one per independent task, channel-connected via the worker template) into git worktrees. Both register via `register_peer` with their `pclass`.
3. **Coordinate mid-flight.** Peers `claim_task` (file-locked, race-safe), do their bounded work, `signal_done` to unblock dependents (pipeline, not a wave barrier), and `raise_conflict` on a write-set clash. The channel carries only these mechanical messages — never a design directive (the closed message-type enum enforces this).
4. **RALPH stop-rule.** A peer reaching an **un-decidable fork** (a design/scope/abstraction choice it must not make) calls `yield_fork(task_id, fork_desc)`. The lead:
   - records the yield on the plan lineage (`yield-arbiter.recordYield`),
   - **arbitrates in main context** (the peer makes NO decision — Article II),
   - records the resolution (`yield-arbiter.recordArbitration`), and
   - re-dispatches the task with the fork resolved into the recipe.
5. **Round boundary.** When a wave of independent tasks completes, the lead commits between rounds (so a dependent round forks from fresh HEAD — see the multi-wave-worktree constraint). Merge of the parallel outputs + the single gate-C is **slice D**, not here.

## Constraints (the sandbox fence — what makes this constitutional)

- **Workers stay bounded.** Peers are recipe-executors (the existing single `swarm-worker` subagent type, or human sessions bound to a claimed-task recipe). They make NO design decisions; an un-decidable fork is a `yield_fork`, not a guess.
- **The channel carries only mechanical coordination.** claim / done / conflict / yield — never a free-form directive. Enforced by the closed message-type enum in `.claude/mcp/sprint-channel/lib/schema.mjs`.
- **The lead is the sole decision locus** (Article II / seed §4.2). All arbitration happens in main context; every yield + resolution is an auditable plan revision.
- **Live hooks govern every peer write.** The 25 PreToolUse guards fire on peer writes exactly as for any worker.
- **Off by default.** `velocity.sprint_mode.enabled` is the fence. This is a prototype; the §II.B charter (slice E) ratifies it only after this proves out.

## The live channel

The channel runs as a baseline-owned MCP server, `.claude/mcp/sprint-channel/server.mjs` (declared in `.mcp.json`), exposing the 7 tools over stdio. The server is the only SDK consumer; the coordination core (handlers + lib) is SDK-free. The SDK ships to consumers via the own-package move (backlog) — for in-repo dogfooding it is an installed devDependency.

## Deferred (not this slice)

- Merge of parallel worker outputs + the single gate-C → **slice D**.
- The §II.B bounded charter that formalizes this → **slice E** (gated on this prototype).
- Consumer SDK delivery (own npm package) → backlog.
