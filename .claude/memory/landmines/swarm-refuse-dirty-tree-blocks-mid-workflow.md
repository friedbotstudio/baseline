---
key: swarm-refuse-dirty-tree-blocks-mid-workflow
category: landmines
scope: [scout, spec, tdd, security, integrate]
---

- Path: `.claude/project.json → swarm.refuse_dirty_tree` (read by `swarm-dispatch` preflight)
- Trap: `refuse_dirty_tree: true` (the original default) aborts swarm-dispatch when `git status --porcelain` is non-empty. But the 11-phase workflow ALWAYS leaves a dirty tree mid-flow: `docs/intake/<slug>.md`, `docs/scout/<slug>.md`, `docs/research/<slug>.md`, `docs/specs/<slug>.md`, `.claude/state/spec_approvals/`, etc. are all uncommitted until gate C / `/commit`. So `refuse_dirty_tree: true` is incompatible with running swarm-dispatch as part of the regular workflow — the check fires on the exact state the workflow is supposed to produce.
- Mitigation: in branch-aware-git-policy (2026-05-15) we toggled `refuse_dirty_tree: false` permanently. The check was meant for pre-workflow runs only; it's effectively unreachable in normal flow with it true.
- Open question (Q-007 in pending-questions): should the default ship as `false`? Currently disagreement between live `.claude/project.json` (false) and `src/project.template.json` (still true) needs resolving.
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
