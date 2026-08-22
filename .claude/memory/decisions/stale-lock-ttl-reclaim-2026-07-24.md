---
key: stale-lock-ttl-reclaim-2026-07-24
category: decisions
scope: [org]
verified-at: b6233f5
last-touched: 2026-07-24
source: assistant-decision. Roadmap Epic 5 task S3; workflow s3-stale-lock-ttl-recovery (tdd-quickfix).
---

- Decision: the `mkdir`-based lock primitive in `.claude/mcp/baseline/lib/lock.mjs` now recovers from a holder that dies mid-task. On `mkdir` `EEXIST`, `withLock` stats the lock dir; a lock whose mtime age exceeds `DEFAULT_LOCK_TTL_MS` (30_000ms, an exported per-call option) is treated as STALE and reclaimed, while a fresh lock is respected (`{acquired:false}`, fn not run). Before this, an EEXIST always returned not-acquired, so a crashed holder leaked the lock dir permanently and the task became unclaimable.
- Race-safety mechanism: reclaim is an ATOMIC RENAME STEAL, not an rmdir-then-mkdir. `reclaimStaleLock(lockDir)` does `renameSync(lockDir, `${lockDir}.stale-${randomUUID()}`)` then `rmdirSync` the stolen path; `renameSync` is atomic, so among concurrent reclaimers exactly one wins the rename and the losers observe `ENOENT` → return `false`, then retry `mkdir` (acquire the freed slot or see `EEXIST`). This is why a naive rmdir+mkdir was rejected — two callers could both rmdir a freshly-created lock and double-acquire (TOCTOU). Test: `test_when_two_callers_reclaim_same_stale_lock_then_exactly_one_wins`.
- Why 30s TTL is safe: the critical section under `withLock` is a single `tasks.json` read/write (sub-millisecond), so a live holder is never mistaken for stale except under OS-level pause/swap (LOW residual, accepted in `docs/security/` bundle for this slice). If work held under the lock ever grows to seconds, raise `ttlMs` (already a param).
- Consumer unchanged: `handlers.mjs` `claimTask` calls `withLock(channelRoot, `task-${task_id}`, fn)` with 3 args; the new options arg defaults, so it is backward-compatible. `key` traversal is still gated at the handler boundary (`isSafeId`), not in the primitive.
- Scope note: unblocks the S4 sprint-mode dogfood (a leaked lock would otherwise wedge a dogfood sprint). See [[sprint-mode-mcp-channel-architecture-pivot-2026-06-23]].
