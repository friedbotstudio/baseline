# Security reports — org-team-charter

## org-team-charter-2026-06-23.md

# Security Review — org-team-charter — 2026-06-23

## Summary

Overall risk: **LOW**. The diff adds a free-form peer→lead→human message channel to the broker pool (broker `message`/`answer` ops, `atomic-store.readMessages`, pool `ask_lead`/`answer_peer` tools), the `org-dispatch` skill helpers, the `org` workflow track, and a constitutional renumber. No secrets, no new dependencies, no crypto, no network-exposed surface (the broker is a single-machine Unix-domain socket). The new message surface reuses the exact trust model already reviewed and accepted for the broker pool's claim/done/yield ops; it introduces no new authentication or authorization boundary.

## Findings

### [LOW] Free-form message body and `kind` are unvalidated at the broker boundary
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/mcp/sprint-broker/broker.mjs` (`OPS.message`)
- **Evidence**:
  ```js
  message: (payload) => {
    const { peer_id, kind = 'query', body = '' } = payload;
    const message_id = newMessageId();
    state.messages.push({ id: message_id, from_peer: peer_id, to: 'lead', kind, body, status: 'open', answer: null });
  ```
- **Impact**: `kind` is not constrained to the `{query, escalation}` enum and `body` has no length cap. A peer (already trusted on the single-machine socket) could store an arbitrary `kind` label or a large body. Worst case is cosmetic mislabeling or local `messages.json` growth — no injection (values are stored/emitted as JSON data and rendered as text, never evaluated).
- **Recommendation**: Optional hardening — clamp `kind` to the enum (default `query` on mismatch) and cap `body` length, mirroring `codec.maxLineLen`. Accepted as LOW for the single-machine trust model; revisit with cross-machine peers.

### [LOW] `messages.json` grows unbounded (same class as the accepted mailbox/yields growth)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-400 (Uncontrolled Resource Consumption)
- **File**: `.claude/mcp/sprint-broker/broker.mjs` (`persistMessages`), `.claude/mcp/sprint-broker/atomic-store.mjs`
- **Impact**: Answered messages are never pruned; the file grows with run length. Single-machine, lead-owned, bounded by a session's lifetime — identical to the already-accepted unbounded mailbox/yields growth from the slice-B review.
- **Recommendation**: Prune `answered` messages on round boundary if growth ever matters. Accepted as LOW.

### [LOW] `peer_id` is self-asserted on the message op (inherits the existing model)
- **OWASP**: A07 - Identification & Authentication Failures | **CWE**: CWE-290 (Authentication Bypass by Spoofing)
- **File**: `.claude/mcp/sprint-broker/broker.mjs` (`OPS.message` uses `payload.peer_id`)
- **Impact**: A peer states its own `peer_id` in the message (as it already does for claim/yield). On the single-machine lead-spawned sandbox there is no cross-peer trust to violate. This is the same accepted posture as the existing ops, not a new gap.
- **Recommendation**: Bind `peer_id` to the socket on `register` if cross-machine peers are ever introduced (#28300, same follow-up as the existing finding). Accepted as LOW.

## Dependencies

No new packages. The pool server continues to use `@modelcontextprotocol/sdk@1.29.0` (already present, context7-verified in the spec). The broker/atomic-store additions are Node stdlib only (`node:net`, `node:fs`).

## Addendum (2026-06-23, post-dogfood) — MEDIUM caught and fixed in-cycle

### [MEDIUM] Broker socket takeover — a second broker could hijack a live channel
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-667 (improper locking) / CWE-400 (uncontrolled resource / availability)
- **File**: `.claude/mcp/sprint-broker/broker.mjs` (`listen()`)
- **Evidence (pre-fix):** on `EADDRINUSE` the broker did `unlinkSync(sockPath)` then re-listened, unconditionally taking over the socket.
- **Impact**: a second session that came up as lead on the same channel (e.g. role confusion) would **silently unlink the live broker's socket and adopt it with fresh, empty state**, splitting the pod — the original lead and peers keep talking to a hijacked endpoint. Integrity + availability of the coordination channel. Missed by the original pass (the broker was noted but the takeover path was not flagged); surfaced by the org-dogfood-1 run.
- **Fix (in-cycle):** `listen()` now **probes** the occupied socket before reclaiming. A live listener (probe connects) → **refuse** with a named error ("one lead per channel"); a stale socket (probe connection refused, crashed prior broker) → unlink and reclaim, preserving legitimate recovery.
- **Regression:** `tests/org-broker-hijack.test.mjs` (refuses a live takeover; still recovers a stale socket).

## Out of scope / Noted

- The `org-dispatch` gate (`orgDispatchGate`) is a refusal-by-default control (off + non-git → refuse), which is a positive security property (opt-in fence), not a finding.
- Consent gates (approve-spec / approve-swarm / grant-commit) and the human-as-final-authority chain are unchanged and remain structural — the charter's Article X explicitly forbids any peer/lead path that bypasses or self-satisfies a gate. Verified by the unchanged gate guards.
- The constitutional renumber (Article X/XI/XII) is documentation; no security surface.

