---
key: .claude/hooks/consent_gate_grant.mjs:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: UserPromptSubmit hook that parses `/approve-direction` / `/approve-swarm` / `/grant-commit` / `/grant-push` in the user's raw prompt **before Claude is invoked**, derives the canonical slug via `lib/common.mjs → canonicalSlug`, and writes a short-lived consent marker at `.claude/state/.<gate>_grant`. The corresponding PreToolUse approval guard (direction/swarm/commit/push) then allows Claude's approval-token write only when the marker is present, fresh (TTL = `consent.gate_marker_ttl_seconds`, default 120s), and slug-matched. Single-use; deleted on the allowed write.
- Caveat: this hook is what makes Article IV consent gates structurally un-forge-able. Runs OUTSIDE Claude's tool boundary — Claude cannot reach the UserPromptSubmit code path, so it cannot mint the marker. The matching write-time `.<gate>_grant` Write/Edit/MultiEdit block lives in each PreToolUse approval guard, not here.
