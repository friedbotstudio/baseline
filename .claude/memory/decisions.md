---
owners: [spec, rca]
category: architectural decisions
size-cap: 500
key: short slug
verifies-against: spec/rca artifact
---

# Architectural decisions

Why this repo took the path it took. Includes rejected alternatives so a future session doesn't re-litigate.

Each entry's stable key is a short slug (e.g., `subagents-vs-skills`, `worktree-isolation`).

---

## branch-aware-git-policy-2026-05-15

- Decision: replace `git_commit_guard`'s unconditional `git push` hard-block with a branch-aware policy driven by `project.json → git.protected_branches` (glob list, default `null` = every branch protected) and `git.branch_pattern` (regex, opt-out via `null`). Add a fourth consent gate `/grant-push` symmetric with `/grant-commit` for protected-branch pushes. Pilot the JS port: `git_commit_guard` and `consent_gate_grant` ported from bash to Node ESM (`.mjs`).
- Rationale: resolves Q-004 (the constitutional disagreement between Article VII's "user-named operation" carve-out and the hook's unconditional block). Unblocks headless / unattended agent runs on non-protected feature branches while keeping `main` and any configured protected glob human-gated. The JS pilot validates the port pattern on the two hooks we were already rewriting; touching the same files twice (once for policy, once for port) would have been wasted effort.
- Rejected alternatives:
  - Keep unconditional hard-block + amend Article VII to match → loses automation enablement; the hook stays Claude-impossible.
  - Prompt-sniffing `/grant-commit` with "and push" → couples push to commit consent in a non-obvious way (Q-004 option c).
  - Defer JS port to a separate intake → would re-edit the same two hook files within weeks; rejected for efficiency.
- Trade-offs accepted: branch-name discipline (`git.branch_pattern`) blocks commits only, not pushes; detached HEAD denies both with explicit error; force-push (`--force`, `--force-with-lease`) still requires user-named operation in addition to branch-policy consent.
- Source: spec at `docs/archive/2026-05-15/branch-aware-git-policy/spec.md`. Workflow archive at `docs/archive/2026-05-15/branch-aware-git-policy/`.
- Verified-at: 3a3314e
- Last-touched: 2026-05-16

## subagents-vs-skills

- Decision: collapsed 10 baseline subagents to 1 (`swarm-worker`); every other capability lives as a skill in main context.
- Rationale: subagents lose conversational context (screenshots, offhand feedback, prior rounds) and produce visibly worse output on judgment-heavy tasks (UI, code architecture, prose). Skills run in the same head as the conversation; richness is preserved. The single remaining subagent earns its keep on **physical filesystem isolation** for parallel work, which skills can't provide.
- Rejected alternatives:
  - Keep the 10-subagent fleet → ui-ux-designer empirically failing despite preloaded `impeccable` (decisions starvation).
  - Per-skill memory-bearing subagents → adds context layers that thin discipline rather than concentrate it.
- Source: this conversation, 2026-04-27 refactor.
- Verified-at: HEAD
- Last-touched: 2026-04-27
