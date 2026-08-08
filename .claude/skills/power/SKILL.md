---
name: power
owner: baseline
description: Power batch-sprint helper — hosts the two behaviours that distinguish the `power` workflow track from spec-entry. (1) Per-ticket iteration: security runs once PER TICKET over workflow.json.tickets[] while the mechanical phases run once for the batch. (2) Commit split: at the commit phase, group the batch's working tree into ordered Conventional Commits via commit-split.mjs, closure last. Invoked within a `power`-track workflow; not a standalone feature. Opt-in via velocity.power_mode.enabled; requires git.
---

# power — batch-sprint track behaviours

The `power` track (in `.claude/workflows.jsonl`) delivers a sprint of related, spec-committed tickets in
ONE cycle. It reuses the standard phase skills; this skill hosts the two behaviours that make it a *batch*
pipeline rather than a single-ticket one. It is invoked from within a `power`-track workflow — never
standalone.

## Precondition

`project.json → velocity.power_mode.enabled` is `true`, `track_id` is `power`, the project is a git repo,
and `workflow.json → tickets[]` lists the batch (the epic sliced-spec shape: one entry per ticket, each
with its AC group + done-record). Off-flag, `power` is not selectable and nothing here runs.

## Behaviour 1 — per-ticket judgment, amortized mechanics

The mechanical phases — `spec`, `simplify`, `integrate`, `document`, `archive`, and the commit-consent
gate — run **once for the batch**. The judgment phase — `security` — runs **once per ticket**: the phase
skill loops over `workflow.json → tickets[]`, running its review for each ticket's AC group and write
surface, and records a per-ticket verdict in the harness log (`power_batch_reviews`). This is a static DAG
with in-skill iteration — there is no runtime node fan-out (the materializer cannot expand a runtime-sized
list).

The amortization is **mechanical-only and structurally visible** — a per-ticket `security` review is never
silently skipped. If any ticket's `security` raises a BLOCKER, the batch yields for it exactly as a
single-ticket workflow would.

## Behaviour 2 — commit split (closure last)

At the commit phase, the batch's working tree is split into a series of small, reviewable Conventional
Commits so per-commit reviewability (bisect/revert) is preserved even though the *cycle* is large.
`commit-split.mjs` composes on `commit-planner`'s `groupDirtyTree` (single-concern grouping) and adds the
power-specific ordering + closure-last rule. Feed it the dirty tree as `[{path, status}]` (the same shape
`groupDirtyTree` consumes — parse it from `git status --porcelain`):

```bash
node .claude/skills/power/commit-split.mjs plan --json   # wraps commit-split.mjs -> planCommits
```

`planCommits(entries)` returns an ordered list of commit groups (config/build → implementation → tests →
docs), each with a Conventional subject, and places the closing `workflow.json` + backlog stamp on the
**final** commit — the closure-atomicity guard in `git_commit_guard` hard-blocks a closure split across
commits, so it must land last. Source groups surface as `feat`; main context refines each to `feat`/`fix`
at commit time. The commit phase commits each group in order under one workflow-scoped `/grant-commit`:
one grant authorizes every commit in this workflow's landing, and only this workflow.

## Constraints

- **Never amortize judgment.** `security` is per-ticket; only mechanical ceremony is shared. Silent
  per-ticket skips are forbidden.
- **Reuse `groupDirtyTree`.** `commit-split.mjs` imports `commit-planner/inventory.mjs`'s
  `groupDirtyTree`; do not reimplement dirty-tree grouping.
- **Closure rides the final commit.** Never split the closing `workflow.json`/backlog stamp across
  commits.
- **Requires git** and the opt-in flag. Off-flag behaviour is byte-unchanged from the pre-power baseline.
