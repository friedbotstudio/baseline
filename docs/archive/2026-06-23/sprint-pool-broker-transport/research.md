# Pattern Research — sprint-pool broker transport

The broker direction is decided (intake). This memo pins the **IPC sub-decisions** that codesign settles at `/spec`. Each section is a decision axis with candidates + a recommendation; the last section assesses swarm-able decomposition.

**Library note:** the entire transport uses Node **stdlib only** — `node:net`, `node:readline` (or manual buffer split), `node:fs`, `node:os`. None are third-party, so context7 does not apply (per its scope: third-party APIs). API shapes below are the stable `node:net` contract (Node ≥18, the baseline's runtime); version-sensitivity is flagged where it exists.

---

## Axis 1 — Transport primitive

### Candidate A1: Unix-domain socket (`net.createServer` listening on a filesystem path) — RECOMMENDED
- **Summary**: Broker calls `net.createServer().listen(sockPath)`; each peer `net.createConnection(sockPath)`. Stream sockets, bidirectional, full-duplex.
- **API (stdlib, Node ≥18)**: `net.createServer([opts], connectionListener)` → `server.listen(path)`; client `net.createConnection({ path })`; `Socket` events `data`/`end`/`error`/`close`; backpressure via `socket.write()` return value + `'drain'`.
- **Fits**: Scout shows separate, independently-spawned processes sharing only the filesystem — UDS is the one-machine shared rendezvous that needs no port allocation and is secured by filesystem perms (mode 0600 on the socket dir). No new dep.
- **Tests it enables**: a real server+client UDS pair in a temp dir (no mocks — Art. VI.3 clean: the socket is the real transport, not an internal mock).
- **Tradeoffs**: **UDS path-length cap is real** — `sun_path` is ~104 bytes (macOS) / ~108 (Linux). A socket under a deep clone path overflows. Mitigation in Axis 5-discovery. Windows UDS differs (named pipes) but Windows is a non-goal.

### Candidate A2: TCP on `127.0.0.1:<port>`
- **Summary**: Same `net` API, `listen(port, '127.0.0.1')` / `connect(port, '127.0.0.1')`.
- **Fits**: Partially. Avoids the path-length cap and is the natural cross-machine upgrade path (non-goal now).
- **Tradeoffs**: Port allocation + discovery (peers must learn the port — a file or env, reintroducing a rendezvous artifact), and any local process can connect (no filesystem-perm gate) unless we add a token (peer-auth is a non-goal). Strictly more surface for a one-machine need. Reject for now; note as the documented cross-machine successor.

### Candidate A3: `child_process.fork` + `process.send` IPC
- **Summary**: Node's built-in structured IPC channel.
- **Fits**: **No — structurally impossible here.** `process.send` requires a parent↔child relationship. Per scout + intake, lead and peers are *separate* Claude Code sessions, each spawning its own MCP server independently; there is no parent/child link between a peer's process and the lead's. Confirmed out.

**Axis 1 recommendation: A1 (UDS).** Flips to A2 only if cross-machine is pulled in-scope (it isn't) or if a real deployment path consistently overflows `sun_path` even from the XDG/TMPDIR rendezvous (Axis 5 mitigates).

---

## Axis 2 — Message framing

### Candidate B1: NDJSON (newline-delimited JSON) — RECOMMENDED
- **Summary**: One JSON object per line; `\n` is the frame delimiter. Encode `JSON.stringify(msg) + '\n'`; decode by buffering bytes and splitting on `\n`.
- **API (stdlib)**: either `readline.createInterface({ input: socket })` (emits one `'line'` per frame, handles partial-read reassembly for you) **or** a manual accumulator: append each `'data'` chunk to a string buffer, `split('\n')`, keep the trailing partial. Manual is ~10 lines and avoids readline's edge cases on socket teardown.
- **Fits**: Matches the existing zero-dep JSON-everywhere style (store.mjs is all JSON). Trivially debuggable (`nc -U sock` shows readable lines).
- **Tests it enables (AC-4)**: feed split chunks (`{"a":1}\n{"a":` then `2}\n`) → assert 2 frames; feed a malformed line (`not json\n`) → assert it's rejected (caught `JSON.parse`, error reply) **without** tearing the connection; feed multiple frames per chunk → assert all parsed.
- **Tradeoffs**: A literal `\n` inside a string value is safe (JSON escapes it as `\\n`), so newline-in-payload is a non-issue. The only real constraint: messages must not contain a raw newline pre-stringify — `JSON.stringify` guarantees that. Unbounded line length is a theoretical DoS (a peer streams forever with no `\n`); cap line length and reject overflow.

### Candidate B2: Length-prefixed framing (4-byte BE length + payload)
- **Summary**: Write `[uint32 length][bytes]`.
- **Tradeoffs**: Robust for binary, no delimiter-escaping concern, but the payload is JSON anyway (text), so NDJSON's "delimiter in data" risk is already nil. Length-prefix adds a binary buffer state machine for zero benefit here and is far less debuggable. Reject — over-engineered for a JSON-only channel (YAGNI).

**Axis 2 recommendation: B1 (NDJSON, manual accumulator with a line-length cap).** Flips to B2 only if we ever send binary blobs (not in scope).

---

## Axis 3 — Broker hosting + lifecycle

### Candidate C1: Lead-MCP-server hosts the broker in-process — RECOMMENDED
- **Summary**: When `SPRINT_POOL_ROLE=lead` (+ `SPRINT_POOL_ACTIVE=1`), the pool server binds the UDS and runs the broker in the same process; lead-side tool calls hit broker state in-memory; peers connect over the socket.
- **Fits**: Mirrors the current startup branch (`server.mjs:114-135`) where `SPRINT_POOL_ACTIVE` already gates lead/peer behavior — minimal new surface. Fewest processes; lead↔state is a function call.
- **Lifecycle (AC-5)**: broker lifetime = lead session lifetime. On `listen`, `unlink` a stale socket first (EADDRINUSE recovery). On peer `'close'`, mark peer inactive (reuse `leavePeer`). On peer reconnect, `register_peer` is idempotent (handlers upsert by `peer_id`) → no duplicate state. **Broker-death story**: if the lead dies, the socket vanishes; peers get `ECONNREFUSED`/`'error'` on next send and surface "broker down" — they do NOT silently no-op. Documented: restart the lead to restore coordination (state recovered via Axis 4).
- **Tradeoffs**: Coordination is only live while the lead session is up — acceptable (the lead is the decision locus anyway; no lead = no arbitration). A crashed lead loses in-flight socket buffers but not committed state (Axis 4).

### Candidate C2: Standalone broker process spawned by the lead
- **Summary**: Lead spawns a detached `node broker.mjs`; lead + peers are all clients.
- **Tradeoffs**: Survives lead restarts (a plus) but adds a process to supervise, an orphan/cleanup story, and a second rendezvous concern (PID file). More moving parts than a single-machine dogfood needs. Reasonable v2 if broker uptime must outlive the lead; reject for now (YAGNI).

**Axis 3 recommendation: C1 (in-process in the lead).** Flips to C2 if broker uptime must survive lead restarts — a real but currently-absent requirement.

---

## Axis 4 — Durability

### Candidate D1: File-backed via reused baseline `store.mjs` (broker = sole writer) — RECOMMENDED
- **Summary**: Broker holds state in memory and persists through baseline `read/writeTasks|Sprint|Yields` against **its own** channelRoot; on boot it reads those files back (recovery).
- **Fits**: Reuses baseline store.mjs **read-only** (import, no edit) — exactly the intake's "reuse verbatim" seam. Single writer ⇒ no cross-process race ⇒ the baseline `withLock` mkdir lock is no longer load-bearing for coordination (it still runs harmlessly inside reused `claimTask`).
- **Tests it enables (AC-3)**: write state, restart broker against the same channelRoot, assert tasks/yields recovered; assert no second process writes the files (sole-writer invariant).
- **Tradeoffs**: A crash mid-`writeTasks` could truncate one file (non-atomic `writeFileSync`). Mitigation: tolerable for a dogfood; a write-temp-then-rename atomic wrapper is a small project-local hardening if needed (does NOT require editing baseline — wrap at the broker layer).

### Candidate D2: In-memory only
- **Tradeoffs**: Simplest, but loses all state on any restart (AC-3 fails outright). Reject — AC-3 requires recovery.

**Axis 4 recommendation: D1 (file-backed via reused store.mjs, broker sole writer).** The broker's channelRoot is a broker-owned path (not a clone's `.claude/state`), reconciling the stale lobby state the scout flagged.

---

## Axis 5 — Socket discovery (the path-length mitigation)

- `$SPRINT_BROKER_SOCK`, if set, is authoritative (operator override; AC-6).
- Documented fallback default: `${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/sprint-broker-<channel>.sock`. This keeps `sun_path` short (well under 104) and **outside any clone**, satisfying the clone-per-peer requirement. `launch.sh` exports it for lead + peers so all sessions share one rendezvous.
- Reject: a socket path inside the repo (`.claude/state/...`) — both re-anchors to the working tree (the original defect) and risks the length cap from a deep clone path.

---

## Swarm-ability assessment (decomposition for Phase 6)

Proposed components and their dependency edges:

| Component | Write surface (project-local) | Depends on |
|---|---|---|
| **Codec** — NDJSON encode/decode + line-cap + malformed handling | new `sprint-pool/codec.mjs` (or `sprint-broker/codec.mjs`) | nothing |
| **Broker core** — in-memory state + persistence via reused baseline handlers/store; dispatch logic | new `sprint-broker/broker.mjs` | Codec (to frame outbound events), baseline handlers (read-only import) |
| **Client adapter** — peer-side: connect, forward tool calls, receive pushes → `notifications/claude/channel` | edits `sprint-pool/server.mjs` + new `sprint-pool/client.mjs` | Codec, Broker core (wire contract) |
| **Lifecycle/discovery** — socket-path resolution, listen/unlink-stale, reconnect, `launch.sh` env, delete `watcher.mjs` | `sprint-pool/server.mjs`, `launch.sh`, remove `watcher.mjs` | Broker core + Client adapter (wires both ends) |

- **Codec is genuinely independent** (leaf, disjoint write_set) → can run as a parallel wave-1 task alongside an early Broker-core skeleton **if** the wire-message shape is pinned in the spec's Contracts table first (so both build to the same schema blind).
- **Broker core, Client adapter, Lifecycle form a chain** (core → adapter → lifecycle): adapter imports the core's wire contract; lifecycle wires both ends. These serialize.
- **Verdict**: the graph is **mostly a chain with one parallelizable leaf (Codec)**. Swarm buys ~one wave of parallelism (Codec ∥ Broker-core-skeleton) **only if** the spec pins the wire contract up front; otherwise it's effectively solo-with-overhead. This is the data the Phase-6 swarm-vs-solo decision needs — present it to the user there. If the spec lands the wire contract as a frozen table, a 2-task wave-1 is defensible; if not, recommend solo.

---

## Recommendation

UDS (A1) + NDJSON with a line-cap (B1) + in-process-in-lead broker (C1) + file-backed via reused store.mjs (D1) + XDG/TMPDIR socket rendezvous (Axis 5). This is the smallest stdlib-only shape that satisfies all six ACs, edits **zero** baseline files, and adds **zero** deps. The whole thing is reversible by `git revert` (project-local, off-by-default-when-shipped; here the dogfood flag is on).

What would flip it: cross-machine entering scope → A2 (TCP); broker uptime needing to outlive the lead → C2 (standalone); binary payloads → B2 (length-prefix). None are in scope today.

## Open questions

- **Wire contract freeze for swarm**: does the spec pin the broker↔client message schema (a Contracts table) up front so Codec + Broker-core can be a parallel wave? If yes → swarm wave-1 is viable; if the user prefers to let the contract emerge during implementation → solo. (Decide at /spec + Phase 6.)
- **Atomic persistence**: is write-temp-then-rename worth the small project-local wrapper for AC-3, or is plain `writeFileSync` acceptable for a single-machine dogfood? (codesign decision.)
- **Socket default location**: confirm `${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/sprint-broker-<channel>.sock` as the documented fallback, vs an explicit always-required `$SPRINT_BROKER_SOCK`. (codesign decision.)
