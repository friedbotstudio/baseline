---
name: commit-planner
owner: baseline
description: Split a dirty working tree into single-concern Conventional Commits. The deterministic inventory.mjs helper groups dirty paths by concern (docs, source + paired test, config, governance); main context refines the grouping and presents a commit plan. Read-only until the user approves the plan — it never stages, never commits, never touches consent paths. Disjoint from the commit skill (Phase 11 executor): the planner proposes a split; the executor lands one consented commit. Use when a working tree has accumulated heterogeneous changes that should not land as one commit.
---

# commit-planner — single-concern commit splitting

A dirty tree with mixed concerns (a hook fix, a docs edit, an unrelated config tweak) should not land as one commit. This skill proposes a split into single-concern [Conventional Commits](https://www.conventionalcommits.org/) groups and stops. Execution stays with `/commit` (Phase 11) under the normal consent gates — one approved group at a time.

**This skill is a generator, not a workflow phase.** It enters no Track Guard ordering, blocks nothing, and writes nothing outside its report. It is read-only until the user approves the plan, and even then it only hands the approved grouping to the normal commit path.

# Method

## 1. Inventory the dirty tree

Run `git status --porcelain` and collect `{path, status}` entries (untracked included). Do not stage anything.

## 2. Group deterministically

Feed the entries to the helper:

```
node -e "import('./.claude/skills/commit-planner/inventory.mjs').then(m => console.log(JSON.stringify(m.groupDirtyTree(<entries>), null, 2)))"
```

`groupDirtyTree(entries)` is **pure and deterministic** — no fs, no git, no clock; the same entries (in any order) produce the same groups. Each group carries:

- `type` — the Conventional Commit type the group's paths imply (`docs`, `test`, `chore`, `feat`/`fix` candidates surface as `src`-typed groups for main context to refine).
- `scope` — a path-derived scope hint (top-level dir or hook/skill slug), or `null`.
- `paths` — the group's member paths. Every input path appears in exactly one group (partition).

Pairing rule: a source file and its paired test (conventional mapping, e.g. `.claude/hooks/foo_guard.mjs` ↔ `tests/foo-guard.test.mjs`) always land in the SAME group — a commit that changes behavior carries its test.

## 3. Refine in main context

The helper's grouping is mechanical. Main context (Article II — decisions live here) refines it: merge groups that are one logical change, pick the final `type(scope): subject` per group, order the groups (dependencies first), and flag any group that intersects governance surfaces (`CLAUDE.md`, `docs/init/**`, `.claude/hooks/**`) for extra review.

## 4. Present the plan and stop

Present the ordered plan — one line per proposed commit: `type(scope): subject` + the paths. Then STOP. Do not stage, do not invoke `/commit`, do not request consent. The user approves, edits, or discards the plan; landing each group goes through the normal `/grant-commit` → `/commit` path (or the active workflow's gate C).

# Constraints

- **Read-only.** No `git add`, no `git commit`, no writes to `.claude/state/` consent paths, no workflow.json changes.
- **Disjoint from `commit`.** This skill plans; `/commit` executes. Never chain them autonomously.
- **The helper is the Foundation; you are the Domain.** Never hand-partition paths when `inventory.mjs` can; never let the helper's mechanical grouping override an obvious logical coupling — refining is your job.
- **Article VII holds.** The plan must never propose `git add -A`/`git add .` — groups name their paths explicitly.
