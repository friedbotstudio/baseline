# Security reports — sprint-channel-mcp

## sprint-channel-mcp-2026-06-23.md

# Security Review — sprint-channel-mcp (slice B core) — 2026-06-23

## Summary

Overall risk after fix: **LOW**. The one HIGH (path traversal via unvalidated ids) was **fixed in this slice** — see the RESOLVED note below. Remaining items are MEDIUM/LOW and accepted or deferred for an opt-in, single-machine sandbox. The message-encoding boundary is sound (JSON.stringify is injection-safe), and the closed-enum schema holds.

> **RESOLVED 2026-06-23 (fix-now, maintainer-approved):** added `.claude/mcp/sprint-channel/lib/safe-id.mjs` (`isSafeId` / `SAFE_ID = /^[A-Za-z0-9_-]+$/`) and a guard at every path-using handler (`registerPeer`, `claimTask`, `signalDone`, `raiseConflict`, `yieldFork`) that rejects a traversal/separator id before any filesystem op. Covered by 3 new tests (`test_when_claim_task_with_path_traversal_id_then_rejected_and_no_escape`, `..._signal_done_with_traversal_id_...`, `..._register_peer_with_invalid_id_...`) — including an assertion that no lock dir escapes `channelRoot`. 13/13 tests green.

## Findings

### [HIGH — RESOLVED] Path traversal via unvalidated `task_id` in the lock-dir path
- **OWASP**: A03 Injection / A04 Insecure Design | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/mcp/sprint-channel/handlers.mjs:52` → `.claude/mcp/sprint-channel/lib/lock.mjs:9`
- **Evidence**:
  ```js
  // handlers.mjs — task_id is peer-supplied, untrusted
  const lock = withLock(channelRoot, `task-${task_id}`, () => { ... });
  // lock.mjs — key flows straight into a filesystem path
  const lockDir = join(channelRoot, `.lock-${key}`);
  mkdirSync(lockDir);
  ```
- **Impact**: a peer calling `claim_task` with `task_id = "../../../../tmp/x"` makes the server `mkdirSync` a directory **outside `channelRoot`**. An attacker controls part of a path used for a filesystem write — directory creation anywhere the process can write, and (combined with the real server resolving `channelRoot` from `sprint_id`) the same class lets `sprint_id` escape the sprint dir. No validation exists anywhere in the handlers.
- **Recommendation**: validate every id at the handler boundary before it touches a path. Add a Foundation guard (mirror slice A's oracle slug check): `const SAFE_ID = /^[A-Za-z0-9_-]+$/;` and reject `task_id`, `peer_id`, `sprint_id` that don't match (return the contracted error shape, e.g. `{claimed:false, reason:'invalid task_id'}`). This is the load-bearing fix — it closes the traversal for the lock key *and* for `sprint_id`-derived `channelRoot` resolution in the deferred server.

### [MEDIUM] Stale lock on holder death (no TTL / recovery)
- **OWASP**: A04 Insecure Design | **CWE**: CWE-667 (Improper Locking) / CWE-400
- **File**: `.claude/mcp/sprint-channel/lib/lock.mjs:11-22`
- **Evidence**:
  ```js
  mkdirSync(lockDir);
  try { return { acquired: true, result: fn() }; }
  finally { rmdirSync(lockDir); }
  ```
- **Impact**: if the process dies between `mkdirSync` and the `finally` `rmdirSync` (crash, kill, OOM), the lock dir persists permanently and that task can never be claimed again — an availability/DoS hazard for a coordination channel whose whole point is that workers may die mid-task.
- **Recommendation**: record a timestamp/PID in the lock dir and treat a lock older than a TTL (or whose PID is dead) as stale and reclaimable. Acceptable to defer to slice C (when the live dispatch exercises real worker death) — track it.

### [LOW] Unbounded mailbox / yields growth
- **OWASP**: A04 Insecure Design | **CWE**: CWE-400 (Uncontrolled Resource Consumption)
- **File**: `.claude/mcp/sprint-channel/lib/store.mjs:24` (`appendMailbox`), `handlers.mjs:96` (`yieldFork`)
- **Impact**: a peer can spam `send_message`/`broadcast`/`yield_fork` to grow `mailbox.jsonl`/`yields.json` without bound (disk exhaustion). Bounded in practice by the single-machine, baseline-spawned-peer trust model.
- **Recommendation**: cap mailbox size / rotate, or cap per-peer message rate. Defer; LOW in the sandbox.

### [LOW] No peer authentication — `peer_id` is self-asserted
- **OWASP**: A07 Identification & Authentication Failures | **CWE**: CWE-306 (Missing Authentication)
- **File**: `.claude/mcp/sprint-channel/handlers.mjs` (all handlers)
- **Impact**: any caller can present any `peer_id`; `signal_done`'s `claimed_by === peer_id` authz check is therefore only as strong as peer-id honesty. A misbehaving peer could spoof another's id to mark its task done.
- **Recommendation**: **accepted in the current trust model** — peers are lead-spawned `swarm-worker` subagents on one machine (the §II.B sandbox). Document the assumption; revisit if/when cross-machine peers are added (issue #28300). LOW + noted.

## Dependencies

**Zero new dependencies.** `package.json`/lockfile unchanged in this diff — the core is pure `node:*` stdlib (the `@modelcontextprotocol/sdk` import lives only in the deferred `server.mjs`, not in this slice). No CVE surface introduced.

## Out of scope / Noted (checked, safe)

- **JSONL injection (CWE-117):** `appendMailbox` writes `JSON.stringify(message) + '\n'`. `JSON.stringify` escapes control characters (including newlines) inside string payloads, so a crafted `payload` cannot inject a forged `mailbox.jsonl` line. **Safe — correct output encoding.**
- **Prototype pollution (CWE-1321):** state is round-tripped via `JSON.parse`, which does not assign `__proto__` as a prototype. **Safe.**
- **Closed-enum boundary (AC-006):** `validateMessage` rejects any `type` outside `CLAIM|DONE|CONFLICT|YIELD|MSG|STATUS` — there is no free-form type to carry a design directive. **Sound by construction.**

