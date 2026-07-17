---
key: .claude/hooks/lib/spec-content-hash.mjs
category: landmarks
scope: [scout]
---

- Role: Foundation — content-addressed identity for an approved spec, so gate A detects a post-approval amendment even for an untracked (first-time) spec whose git SHA is `N/A`. Single concern: `computeSpecContentHash(bytes)` → sha256 hex over a string or Buffer, throwing on any other type so a caller never silently hashes a coerced value. Pure and stdlib-only (`node:crypto`), so it runs identically in the `/approve-spec` command SOP and in the harness resume path.
- Companion: `.claude/commands/approve-spec.md` (records the hash in the approval token), `.claude/skills/harness/SKILL.md` (recomputes on resume; mismatch → re-yield at gate A), `tests/spec-content-hash.test.mjs`, `tests/gate-a-content-reyield.test.mjs`.
- Verified-at: 212dbd0
- Last-touched: 2026-07-10
