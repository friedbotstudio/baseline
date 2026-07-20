---
key: .claude/hooks/destructive_cmd_guard.mjs:1
category: landmarks
scope: [scout]
verified-at: HEAD
last-touched: 2026-06-21
---

- Role: PreToolUse(Bash) guard. Two tiers from `project.json → destructive.{hard_block_patterns, ask_patterns}` (regex over the whole command; `mode: ask|block`): hard-block catastrophic ops (rm -rf /, fork bomb, dd of=/dev/sd, mkfs, shutdown), ask on risky ones (rm -rf, git reset --hard, git clean -f, drop table, npm publish…). PLUS a **Bash consent-write block** (added 2026-05-31, Finding B): denies any Bash command writing a consent path under `.claude/state/` (`commit_consent`, `push_consent`, `.*_grant` markers, `spec_approvals/**`, `swarm_approvals/**`) via redirect (`>`/`>>`/`>|`), write-verb (tee/cp/mv/install/dd/ln), `sed -i`, or a program write (JS `writeFileSync`… or python/ruby/perl `open(...,'w')`). Closes the gap that the four approval guards only match Write/Edit/MultiEdit — a Bash-written token bypassed them. PLUS a sibling **epic-approval-write block** (`lib/common.mjs → writesEpicApproval`, added 2026-06-21, backlog `-abad`): denies any Bash command that sets `approved: true` on a path under `.claude/state/epic/`, parity with the consent block — content-scoped so children/status/timestamp writes and reads pass; closes the same-class bypass of `epic_approval_guard` (which only matches Write/Edit/MultiEdit).
- Caveat: best-effort defense-in-depth behind the Write-matcher approval guards (the primary structural control). `$VAR`-indirected paths are now handled (expansion before scan). Residual: the epic block misses a `cd`/`pushd`-into-`.claude/state/epic` write with a generic filename (the discriminator is the directory, not a self-identifying basename) — tracked in backlog; durable fix is read-side approval derivation in `track_guard`.
