# Security reports — sprint-channel-lifecycle-tools

## sprint-channel-lifecycle-tools-2026-07-25.md

# Security Review — sprint-channel-lifecycle-tools — 2026-07-25

## Summary
Overall risk: **LOW**. Ports two lifecycle tools from `sprint-pool` to the shipped
`sprint-channel` MCP server: `release_task` (lead re-dispatch) and `leave_peer` (deregister).
Both follow the existing handler trust model — every peer/task id is gated through `isSafeId`
(CWE-22) before any filesystem access, writes stay within the `sprint_id`-resolved `channelRoot`,
and `release_task` mutates under the same `withLock` primitive as `claim_task`. No new trust
boundary, no secrets, no injection surface, no new dependency. No CRITICAL/HIGH findings.

## Findings

### [LOW] `release_task` is unauthenticated (as is the whole channel)
- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-862
- **File**: `.claude/mcp/sprint-channel/handlers.mjs` (`releaseTask`)
- **Evidence**:
  ```
  export function releaseTask({ channelRoot, task_id, brief }) {
    if (!isSafeId(task_id)) return { released: false, error: 'invalid task_id' };
    const lock = withLock(channelRoot, `release-${task_id}`, () => { ... });
  ```
- **Impact**: Any peer with channel access can release any task, not just the lead. This matches
  the channel's existing model — the whole file channel is a shared, unauthenticated on-disk
  directory (every one of the 9 tools trusts its caller); `release_task` adds no privilege the
  channel did not already grant. The sandbox boundary is the repo/machine, not per-tool auth.
- **Recommendation**: Accept as-is. Per-caller authorization is out of scope for the file-based
  prototype (the pool broker model is where a lead/peer split would live). The `done`-guard
  prevents the one destructive misuse (resurrecting a completed task).

## Dependencies
None added. Imports are the existing Foundation primitives (`store`, `lock`, `safe-id`) — no SDK,
no third-party code.

## Out of scope / Noted
- **Traversal is covered.** `test_when_release_task_with_traversal_id_then_rejected` and
  `test_when_leave_peer_with_traversal_id_then_rejected` assert `isSafeId` rejects a `../` id before
  any fs write — the same guard and test shape as the existing `claim_task`/`signal_done` traversal
  tests.
- **`leave_peer` is idempotent** (`removed:false` on an absent peer) — no error-oracle leak, no
  partial-write path.
- **`release_task` locking** reuses `withLock` (now TTL-reclaim-safe per the S3 fix), so a crashed
  release cannot wedge the task.

