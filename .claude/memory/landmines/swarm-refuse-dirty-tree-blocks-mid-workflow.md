---
key: swarm-refuse-dirty-tree-blocks-mid-workflow
category: landmines
scope: [tdd, integrate]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/project.json → swarm.refuse_dirty_tree` (read by `swarm-dispatch` preflight)
- Trap: `refuse_dirty_tree: true` (the original default) aborts swarm-dispatch when `git status --porcelain` is non-empty. But the 11-phase workflow ALWAYS leaves a dirty tree mid-flow: `docs/intake/<slug>.md`, `docs/scout/<slug>.md`, `docs/research/<slug>.md`, `docs/specs/<slug>.md`, `.claude/state/spec_approvals/`, etc. are all uncommitted until gate C / `/commit`. So `refuse_dirty_tree: true` is incompatible with running swarm-dispatch as part of the regular workflow — the check fires on the exact state the workflow is supposed to produce.
- Mitigation: in branch-aware-git-policy (2026-05-15) we toggled `refuse_dirty_tree: false` permanently. The check was meant for pre-workflow runs only; it's effectively unreachable in normal flow with it true.
- Q-007 RESOLVED (epic3-template-gap, 2026-07-18): the template now ships `refuse_dirty_tree: false` to match live. The live/template disagreement is closed, and the live↔template drift class is now guarded by `checkConfigParity` (the `swarm` block is compared with no allowlist entry) — see [[live-template-config-drift-silent]].
