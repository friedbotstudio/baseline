# Security reports — s3-stale-lock-ttl-recovery

## s3-stale-lock-ttl-recovery-2026-07-24.md

# Security Review — s3-stale-lock-ttl-recovery — 2026-07-24

## Summary
Overall risk: **LOW**. The change adds TTL-based stale-lock recovery to the `mkdir` lock
primitive (`.claude/mcp/sprint-channel/lib/lock.mjs`). The reclaim path is race-safe by
construction — an atomic `renameSync` steal admits exactly one winner among concurrent
reclaimers — and introduces no new trust boundary, no secrets, no dependencies, and no
network/IO surface beyond local temp-dir management. No CRITICAL or HIGH findings.

## Findings

### [LOW] A live holder past the TTL window can have its lock reclaimed (design residual)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-367 (TOCTOU)
- **File**: `.claude/mcp/sprint-channel/lib/lock.mjs:52` (the `Date.now() - held.mtimeMs <= ttlMs` branch)
- **Evidence**:
  ```
  if (Date.now() - held.mtimeMs <= ttlMs) return false; // fresh — a live holder
  reclaimStaleLock(lockDir);
  return tryMkdir(lockDir);
  ```
- **Impact**: If a holder's critical section exceeds `ttlMs` (30s) — only possible under OS-level
  pause/swap, not normal execution — a second caller would reclaim the lock, permitting two
  concurrent holders and a double-claim. The critical section here is a single `tasks.json`
  read/write (sub-millisecond), so the 30s TTL carries a ~10⁴–10⁵× margin.
- **Recommendation**: Accept as-is. The mismatch between the millisecond critical section and the
  30s TTL makes this negligible. If the work performed under `withLock` ever grows to seconds,
  raise `ttlMs` accordingly (it is already a per-call option). No code change needed now.

### [LOW] `reclaimStaleLock` swallows `rmdirSync` errors (best-effort cleanup)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-459 (Incomplete Cleanup)
- **File**: `.claude/mcp/sprint-channel/lib/lock.mjs:27`
- **Evidence**:
  ```
  try { rmdirSync(stolen); } catch { /* best-effort: uniquely named, orphaned at worst */ }
  ```
- **Impact**: If `rmdirSync` on the renamed-away dir fails for a non-ENOENT reason, a uniquely
  named empty `.stale-<uuid>` directory is orphaned inside `channelRoot`. It is an empty dir, so
  `rmdir` failure is practically limited to permission/FS anomalies; the disk cost is trivial and
  it never affects lock correctness (the live lock name is already free by then).
- **Recommendation**: Acceptable. The stolen name is unique (crypto `randomUUID`), so orphans
  cannot collide or block future acquisition. No action.

## Dependencies
No new packages. Imports are all Node stdlib: `node:fs` (`mkdirSync`, `rmdirSync`, `statSync`,
`renameSync`), `node:path` (`join`), `node:crypto` (`randomUUID`). `randomUUID` is a CSPRNG-backed
identifier — no predictability or collision concern in the steal-path naming.

## Out of scope / Noted
- **`key` validation is the caller's contract.** `withLock` interpolates `key` into `.lock-${key}`
  without validating it, but every consumer (`claimTask`, `signalDone`, …) gates `task_id`/`peer_id`
  through `isSafeId` first (`handlers.mjs:43`), and the existing test
  `test_when_claim_task_with_path_traversal_id_then_rejected_and_no_escape` proves no lock dir
  escapes `channelRoot`. Validation stays at the handler boundary by existing design — unchanged by
  this diff.
- **Atomic-steal correctness (not a finding).** `renameSync` is atomic on POSIX and Windows, so among
  N concurrent reclaimers exactly one wins the rename and the losers observe `ENOENT` → `false`,
  then retry `mkdir` and either acquire the freed slot or see `EEXIST`. This is the property that
  makes concurrent reclaim safe and is covered by
  `test_when_two_callers_reclaim_same_stale_lock_then_exactly_one_wins`.
- **No symlink escape.** The lock path is a real directory created by `mkdirSync`; the steal target
  is a sibling within `channelRoot`. No symlink following is introduced.

