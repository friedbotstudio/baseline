---
key: sprint-channel-lock-stale-ttl-recovery-medium
category: backlog
scope: any
status: open
raised-on: 2026-06-23
raised-in-context: sprint-channel-mcp
source: assistant-deferral
estimated-effort: small
parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
verified-at: 80aeeca
last-touched: 2026-06-23
caveat: from `docs/archive/2026-06-22/sprint-channel-mcp/security.md` (CWE-667/CWE-400). LOW companions (unbounded mailbox/yields growth; no peer authn — `peer_id` self-asserted) are accepted in the single-machine lead-spawned sandbox trust model; revisit on cross-machine (#28300).
---

> verbatim (assistant-deferral, slice-B security review, 2026-06-23): "stale lock on holder death (no TTL / recovery) — if the process dies between mkdirSync and the finally rmdirSync, the lock dir persists permanently and that task can never be claimed again."

- Intent: add stale-lock recovery to `.claude/mcp/sprint-channel/lib/lock.mjs`. The atomic `mkdir` lock leaks permanently if a holder dies mid-task (crash/kill/OOM) → the task is unclaimable forever (availability/DoS). MEDIUM finding, accepted for the slice-B CORE; must land when Slice C exercises real worker death.
- Approach: record a timestamp/PID in the lock dir; treat a lock older than a TTL (or whose PID is dead) as stale and reclaimable.
