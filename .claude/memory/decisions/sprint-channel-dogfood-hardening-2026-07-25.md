---
key: sprint-channel-dogfood-hardening-2026-07-25
category: decisions
scope: [org]
verified-at: 2db6d0c
last-touched: 2026-07-25
source: assistant-decision + user direction (2026-07-25). Live sprint-mode dogfood on channel `dogfood-1`; user: "fix two open issues as well". Workflow sprint-channel-lifecycle-tools (tdd-quickfix).
---

- Context: the first live sprint-mode dogfood (lead here + a human-launched `companion-1` peer over the file-based `sprint-channel`) proved the happy path (register → claim → execute → signal_done) AND the yield path (claim → yield_fork → lead-arbitrate → re-dispatch → complete), and surfaced three gaps. All three were fixed the same session.
- **Gap 1 (fixed) — idle peer not woken.** `/companion`'s claim loop was one-shot: after draining it stopped, so a lead re-dispatch (or mailbox message) never reached an idle peer; the file channel has no peer-side push/poll (only the `sprint-pool` broker pushes via `claude/channel`). Fix: added **watch mode** — `.claude/skills/companion/watch.mjs` blocks until a task is claimable by the peer then exits, and the background-task-completion RE-INVOKES the companion session to claim it (same background→re-invoke pattern the lead uses). One re-entry arms it; thereafter every re-dispatch is auto-claimed with zero human input (verified live: `t-gamma` auto-picked-up in ~12s). companion is throwaway/non-baseline, so this went via quick prototype iteration.
- **Gap 2 (fixed) — `yield_fork` doesn't release the claim.** A yielded task stayed `claimed_by` the yielder; `sprint-channel` had no `release_task`, so re-dispatch required hand-editing `tasks.json`. Fix: **ported `release_task` from `sprint-pool`** to `sprint-channel/handlers.mjs` + `server.mjs` — resets the task to `pending`, clears `claimed_by`, optionally swaps in a settled `brief` (one-call re-dispatch), resolves the open yield, all under `withLock`. Added a `done`-guard (never resurrect a completed task) beyond the pool's version.
- **Gap 3 (fixed) — no deregister.** `/companion off` was best-effort-local. Fix: **ported `leave_peer`** — removes the peer from `sprint.peers[]` (idempotent, `removed:false` if absent); `/companion off` now calls it. Chose true removal over the pool's soft `active:false` (simpler peer record; matches the finding's intent).
- Net: `sprint-channel` grew from 7 to **9 tools** (added `release_task`, `leave_peer`); the shipped bundle was rebuilt. Both tools gate ids via `isSafeId` (traversal tested). Pattern-copy from `sprint-pool` (which already had both). See [[stale-lock-ttl-reclaim-2026-07-24]] (the `withLock` TTL fix `release_task` relies on) and [[sprint-channel-mcp-registration-2026-07-25]] (S4, which made this channel dogfoodable).
