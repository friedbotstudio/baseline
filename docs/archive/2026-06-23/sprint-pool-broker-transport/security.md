# Security reports — sprint-pool-broker-transport

## sprint-pool-broker-transport-2026-06-23.md

# Security Review — sprint-pool-broker-transport — 2026-06-23

## Summary

Overall risk: **MEDIUM**. The broker introduces a local IPC trust boundary (a Unix-domain socket parsing untrusted NDJSON frames). One MEDIUM robustness/DoS finding (prototype-chain property access in the op-dispatch map crashes the broker on a crafted frame) is worth fixing now — the fix is one line. The remaining items (socket world-connectability, predictable temp filename) are LOW under the documented single-user / single-machine dogfood trust model, consistent with the existing `sprint-channel` security posture. No new dependencies; the CWE-22 `isSafeId` guard is correctly preserved through the broker path.

## Findings

### [MEDIUM — RESOLVED in-workflow] Op-dispatch reaches inherited Object.prototype members → broker crash on crafted frame

> **Resolved 2026-06-23**: `dispatch` now gates on `Object.hasOwn(OPS, op)` (broker.mjs), and `test_when_frame_op_is_prototype_key_then_error_ack_no_crash` locks it — a crafted `__proto__`/`constructor` op returns an error ack and the broker survives. Original finding retained below for the record.


- **OWASP**: A04 - Insecure Design | **CWE**: CWE-471 (Modification of Assumed-Immutable Data) / CWE-1321-adjacent (prototype property access)
- **File**: `.claude/mcp/sprint-broker/broker.mjs:73-78` (the `OPS` map + `dispatch`)
- **Evidence**:
  ```js
  const OPS = { register: handleRegister, claim: ..., signal_done: ..., yield: ... };
  function dispatch(frame, socket) {
    const { op, id, payload = {} } = frame;
    const handler = OPS[op];                 // OPS['__proto__'] -> Object.prototype (truthy, not callable)
    const result = handler ? handler(payload, socket) : { error: `unknown op: ${op}` };
  ```
- **Impact**: A frame `{"op":"__proto__"}` makes `OPS[op]` resolve to `Object.prototype` — truthy but not a function — so `handler(payload, socket)` throws `TypeError` inside the socket `'data'` handler, an **uncaught exception that crashes the broker process** (coordination DoS for the whole sprint). `{"op":"constructor"}` / `{"op":"toString"}` resolve to callable inherited members and are invoked as handlers, producing malformed acks. Any local process able to `connect(2)` the socket (see next finding) can trigger this with one line.
- **Recommendation**: Dispatch only on own-properties. Either build the map as `Object.create(null)` (no prototype chain) or gate with `Object.hasOwn(OPS, op)` before lookup: `const handler = Object.hasOwn(OPS, op) ? OPS[op] : null;`. One line; no behavior change for valid ops.

### [LOW] Unix-domain socket is world-connectable by default (no peer auth)

- **OWASP**: A05 - Security Misconfiguration | **CWE**: CWE-276 (Incorrect Default Permissions)
- **File**: `.claude/mcp/sprint-broker/broker.mjs:108-110` (`server.listen(sockPath)`), `.claude/mcp/sprint-broker/sock-path.mjs`
- **Evidence**:
  ```js
  server.once('listening', resolve);
  server.listen(sockPath);   // socket created with process umask; typically 0755 -> any local user can connect
  ```
- **Impact**: On a multi-user host, any local user could connect and inject coordination ops (claim/yield/enqueue-effects). **Accepted** under the documented trust model (single-user, single-machine dogfood; peer authentication is an explicit non-goal) — same posture as the existing `sprint-channel` "no peer authn — `peer_id` self-asserted" accepted finding. **Recommendation (defense-in-depth, optional)**: place the socket in a 0700 dir (the XDG runtime dir already is), or `chmodSync(sockPath, 0o600)` after `listen`. Revisit when cross-machine / multi-user is pulled in scope.

### [LOW] Predictable temp filename for atomic persist

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-377 (Insecure Temporary File)
- **File**: `.claude/mcp/sprint-broker/atomic-store.mjs:18`
- **Evidence**:
  ```js
  const tmp = join(channelRoot, `${name}.tmp-${process.pid}-${Math.floor(performance.now() * 1000)}`);
  ```
- **Impact**: The temp name is predictable, but it is written **inside the broker-owned `channelRoot`** (the repo-local `.claude/state/sprint/<id>/`, user-owned, or a 0700 `mkdtemp` in tests) — NOT a world-writable shared `/tmp`. A symlink/clobber attack needs write access to that dir, which already implies control of the coordination state. **Accepted as LOW** — the broker owns the directory. (Note: the *socket* lives in `/tmp`, but no temp *files* do.)

### [LOW] Explicit `$SPRINT_BROKER_SOCK` bypasses the length guard

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/mcp/sprint-broker/sock-path.mjs:14`
- **Evidence**:
  ```js
  if (env.SPRINT_BROKER_SOCK) return env.SPRINT_BROKER_SOCK;   // returned verbatim, no <=100 byte check
  ```
- **Impact**: An over-length explicit socket path skips the friendly `> 100` throw and instead fails at `bind()` with a less clear error. Operator-controlled (trusted) input; fails loud (no silent truncation). **Accepted as LOW.**

## Dependencies

No new packages. Transport is `node:net` / `node:fs` / `node:os` / `node:path` (stdlib). The MCP SDK is unchanged (already a devDep). `npm audit` surface unchanged by this diff.

## Out of scope / Noted

- **Broadcast reaches unregistered connections** (`broker.mjs` `broadcast` writes to every socket in `sockets`, including a peer that connected but never `register`ed): minor task_id info-disclosure to a connected-but-unregistered local process. LOW under the single-user model; accept.
- **Unbounded `sockets`/`socketPeers` growth** under a connect/disconnect flood: bounded by the `'close'` cleanup; consistent with the accepted "unbounded mailbox/yields growth" note in the existing `sprint-channel` review. LOW; accept.
- **`isSafeId` (CWE-22) preserved** — `peer_id`/`task_id` reach the baseline handlers (`registerPeer`/`claimTask`/`signalDone`/`yieldFork`) and the pool `enqueueTask`/`releaseTask`, all of which validate via `isSafeId` before any path/state use. The broker passes these through verbatim and does not bypass the guard. No finding (positive).

