---
key: .claude/hooks/epic_approval_guard.mjs:1
category: landmarks
scope: [scout]
---

- Role: the 23rd hook (added 2026-06-10, commit 121078f). PreToolUse(Write|Edit|MultiEdit) guard enforcing seed §18.9. Makes the epic `approved: true` flip un-forgeable: ALLOWS a false→true transition of `approved` in `.claude/state/epic/<slug>.json` only when the persistent token `.claude/state/spec_approvals/<slug>.approval` exists. That token is itself unforgeable (only `spec_approval_guard` permits its creation, and only on a fresh consent marker Claude cannot write), so authorization derives from the same forge-proof root as gate A — no new command, no new marker, no second human approval (spec: Candidate B).
- Companion: `.claude/hooks/spec_approval_guard.mjs` (produces the token this guard requires), `.claude/hooks/track_guard.mjs` (reads `approved` to let an epic-child skip mandatory discovery).
- Verified-at: 01ce882
- Last-touched: 2026-06-22
- Caveat: scope is deliberately narrow — fires ONLY on `.claude/state/epic/<slug>.json` writes, gates ONLY the false→true `approved` transition. Children[] appends, status flips, and idempotent re-writes of an already-approved epic pass through ungated (the `currentApproved` short-circuit at line 68). Existence + slug match only, NO TTL (an approved spec stays approved). The Bash write surface is now closed in parallel by `destructive_cmd_guard` via `lib/common.mjs → writesEpicApproval` (workflow `epic-approved-bash-surface`, backlog `-abad`); a residual `cd`/`pushd`-into-dir bypass remains (see backlog `residual-cd-into-epic-dir-bypass-...`). The durable fix is read-side derivation in `track_guard` (eliminate the trusted boolean).
