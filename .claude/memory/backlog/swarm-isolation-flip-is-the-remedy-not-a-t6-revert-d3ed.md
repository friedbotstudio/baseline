---
key: swarm-isolation-flip-is-the-remedy-not-a-t6-revert-d3ed
category: backlog
status: open
raised-on: 2026-08-09
raised-in-context: harness-batch-fixes
source: assistant-deferral
scope: [triage, security]
governs: .claude/project.json, src/project.template.json, .claude/hooks/swarm_boundary_guard.mjs
verified-at: dd0e5d2
last-touched: 2026-08-09
---

> verbatim (assistant, 2026-08-08, `docs/specs/harness-batch-fixes.md` → Rollback):
> "Remedy is the one-line `swarm.isolation` flip, not a T6 revert."

- T6 made swarm the default code-generation route on five tracks (`min_tasks_worth_swarming: 1` plus an `implementation` selector). The engineer decided at gate A (decision D-1) to leave `swarm.isolation` at `shared`, against the recommendation to flip it to `worktree`.
- Accepted consequence, recorded in `docs/security/harness-batch-fixes-2026-08-09.md` as a MEDIUM finding (A04 / CWE-693): every dispatched `swarm-worker` writes into the primary tree, so `swarm_boundary_guard`'s `write_set` enforcement is the only barrier between concurrent workers. There is no filesystem backstop and no merge-audit checkpoint.
- Trigger to pick this up: a `swarm_boundary_guard` denial during any post-landing wave, or a merged file no task declared in its `write_set`. Either means two workers collided in the shared tree.
- The fix is one config line — `swarm.isolation: "worktree"` — in `.claude/project.json` and `src/project.template.json`. It needs no code change and does not touch T6. Do **not** revert T6 to address a collision; that removes the parallelism and leaves the isolation question unanswered.
- Note for whoever picks this up: `src/project.template.json` has shipped `shared` since before T6, so every consumer install is on shared isolation too. The public docs at `site-src/swarm.njk` were corrected on 2026-08-09 to stop claiming worktree is the default.
