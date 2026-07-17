---
key: gate-a-content-hash-and-power-track-first-live-run-2026-07-10
category: decisions
scope: [spec]
source: user-instruction (the descope + freeze-exception + "club these into a power cycle" directives, 2026-07-10) + spec `docs/archive/2026-07-10/harden-power-track-debt/spec.md`.
verified-at: 66a11f4
last-touched: 2026-07-10
---

- Decision: gate A now content-binds. `/approve-spec` writes a 5th token line — `computeSpecContentHash` (sha256 of the spec bytes) from the NEW shipped helper `.claude/hooks/lib/spec-content-hash.mjs` (pure, node:crypto, fail-safe). The harness resume path recomputes it via `compareSpecHash(tokenHash, specBytes)` and re-yields at gate A on mismatch. This mechanizes the manual "revoke approve-spec from completed[] after a spec amendment" discipline that cost `power-track-completion` FOUR hand-revocations. Additive — the forge-proof `consent_gate_grant` marker handshake is untouched.
- Why it matters: the prior token's line-4 git SHA is `N/A` for any UNTRACKED (first-time) spec — i.e. every spec at its first approval — so nothing mechanically detected a post-approval amendment. The content hash is meaningful regardless of git-tracking state. Fail-safe: an absent/blank/`N/A` line-5 (a token predating this feature) compares false → re-yield, so a stale token can never silently satisfy the gate (security-confirmed: no fail-open-to-true on any malformed input).
- Introduction-workflow note: T1 shipped in this batch and immediately dogfooded itself — its OWN re-approval (after a spec amendment) was the first token to carry a real content hash, and the resume check confirmed the spec unchanged. But the harness resume comparison goes fully live the NEXT workflow (this batch's earlier gate-A rounds ran on the old path-only token).
- Power track: FIRST real end-to-end run of the `power` track (shipped 66a11f4). Both power-specific behaviors were exercised live and worked: (1) `security` ran PER-TICKET over `tickets[]` (T1:LOW, T2:CLEAN, T3:CLEAN in `power_batch_reviews`); (2) `/commit` splits the batch into an ordered Conventional-Commit series under one workflow-scoped `/grant-commit`. The flag `velocity.power_mode.enabled` was flipped true in this repo's `.claude/project.json` (dev config, committed) so the baseline dogfoods power permanently — the `requires_config_flag` fence (shipped 66a11f4) correctly admitted power only after the flip.

---
