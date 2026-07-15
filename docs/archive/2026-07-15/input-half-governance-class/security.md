# Security reports — input-half-governance-class

## input-half-governance-class-2026-07-15.md

# Security Review — input-half-governance-class — 2026-07-15

## Summary

Overall risk: **LOW**. This batch adds a mechanical Governance Class classifier (A1), an evidence-shape ladder (A2), a brainstorm probe-discipline pattern (A3), a provenance anchor for the `/approve-spec` token (A4), and a Class-driven `skip_brainstorm` (A5). All new behavior is behind two flags that default off (`governance.class.enabled`, `governance.approval_provenance.enabled`). No secrets, no new dependencies (stdlib only), no network or DB surface. The consent-gate-adjacent change (A4) was reviewed most closely and is **strictly additive** to the existing human-consent marker. No CRITICAL/HIGH/MEDIUM findings.

## Per-ticket verdicts (`power` batch)

| Ticket | Surface | Verdict |
|---|---|---|
| A1 | `tier-dial.mjs` classFloor/raiseClass, `governance-class.mjs` extractSignals | CLEAN |
| A2 | `evidence-ladder.mjs` | CLEAN |
| A3 | `discipline.mjs` MULTIPLE_CHOICE_PATTERNS | CLEAN |
| A4 | `spec_approval_guard.mjs` A4 block, `approval-anchor.mjs`, `approval-provenance.mjs`, `evidence-ledger.mjs` append | CLEAN (reviewed most closely) |
| A5 | `flag-parser.mjs` resolveSkipBrainstorm | CLEAN |

## Findings

### [LOW] A4 provenance anchor is an audit layer, not an anti-forgery control against Claude
- **OWASP**: A04 Insecure Design (by-design, documented) | **CWE**: n/a
- **File**: `.claude/hooks/spec_approval_guard.mjs` (A4 block), `.claude/skills/harness/evidence-ledger.mjs:appendApprovalProvenance`
- **Evidence**: the approval token's `ledger_ref` resolves against `.claude/state/evidence-ledger/<slug>.json`, which the harness (Claude) writes via `appendApprovalProvenance`. Claude could append a provenance entry and reference it.
- **Impact**: the anchor does NOT add anti-forgery strength against Claude — but it does not need to. The fresh human consent marker (`validateConsentMarker`, written outside Claude's tool boundary by `consent_gate_grant`) remains the sole anti-forgery control and is unchanged. A4 is a provenance/audit layer (which Class, which evidence verdict, which spec hash the grant was against), exactly as specified (spec D-4).
- **Recommendation**: none — matches the design intent. Recorded so a future reader does not mistake the anchor for a consent-strengthening control. The security-relevant invariant (a human must run `/approve-spec`) is preserved.

### [LOW] Enabling `approval_provenance` before the ledger flow is wired self-blocks gate A (fail-safe)
- **OWASP**: A05 Security Misconfiguration (availability, not confidentiality/integrity) | **CWE**: n/a
- **File**: `.claude/hooks/spec_approval_guard.mjs` (A4 block, fail-safe path)
- **Evidence**: when `governance.approval_provenance.enabled` is true and no `approval-provenance` ledger entry exists, `verifyApprovalAnchor` returns `{ok:false}` → `emitBlock`. Every `/approve-spec` blocks until the provenance flow writes an entry.
- **Impact**: self-inflicted availability stop (fails safe/closed — never fails open to a bad approval). No security exposure.
- **Recommendation**: none needed — the spec's rollout order (flip `class.enabled` first; flip `approval_provenance.enabled` only after ledger entries are observed) and the Rollback signal already govern this. Fail-closed is the correct posture for a consent gate.

## Checked and clean

- **A4 additive-only**: the A4 block runs after `validateConsentMarker` and can only `emitBlock` (deny) — never `emitAllow` earlier. Flag off (default) → the block is not reached → byte-identical to today's gate. No path weakens consent. (A01 Broken Access Control: none.)
- **A4 self-approval**: the existing self-approval block (`docs/specs/` branch) is untouched; Claude still cannot write the consent marker (`blockMarkerSelfWrite`). No new self-approval vector.
- **CWE-22 path traversal**: `deriveApprovalToken` calls `assertSafeSlug(slug)` (REJECT-never-repair) and throws on `../`. The guard builds `ledgerPath` from `canonicalSlug`-normalized `expectedSlug`; the attacker-influenced `ledger_ref` is used only for string-equality entry lookup, never path construction.
- **A3 ReDoS**: all four `MULTIPLE_CHOICE_PATTERNS` use a single lazy `[\s\S]*?` bounded by literals or fixed alternations with no nested/overlapping quantifiers — linear-time; input is a bounded model turn. (A03 Injection / DoS: none.)
- **A1 resilience**: `classFloor` degrades to the tier fallback on a null/invalid `projectJson` without throwing (AC-103, tested); `extractSignals` builds regexes only from trusted `project.json` globs, not attacker input.
- **A2/A5**: pure functions, no trust boundary.

## Dependencies

No new packages. All code is Node stdlib (`node:fs`, `node:path`) plus in-repo imports (`plan-store.assertSafeSlug`, `common.projectGet`).

## Out of scope / Noted

- The whole feature is opt-in and OFF by default; consumers and this repo's current gate-A behavior are unchanged until a maintainer flips the flags. This bounds the blast radius of any latent issue to projects that explicitly opt in.

