---
key: .claude/skills/power/commit-split.mjs
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Foundation — plans an ordered series of Conventional Commits from a dirty working tree for the power track's amortized commit phase. Single export `planCommits(entries)` over the dirty-tree array `[{path, status}]`. Composes `.claude/skills/commit-planner/inventory.mjs → groupDirtyTree` for single-concern grouping (**reuse, not reimplement**) and adds only the power-specific concern: ordering. `TYPE_MAP` ranks groupDirtyTree's `{chore, src, test, docs}` types as build/config(0) → implementation(1) → tests(2) → docs(3), mapping `src` to a mechanical `feat` placeholder that main context refines to feat/fix at commit time.
- Companion: `.claude/skills/commit-planner/inventory.mjs` (the grouping it composes on), `.claude/hooks/git_commit_guard.mjs` (the closure-atomicity guard it must satisfy). Tests: `.claude/skills/power/tests/commit-split.test.mjs`.
- Caveat: `isClosurePath` forces `workflow.json` + `backlog.md` onto the FINAL commit. This is not cosmetic — `git_commit_guard` hard-blocks a closing commit whose staged `backlog.md` lacks the `source_backlog_keys` closure stamp, so a closure split across commits is rejected. Keep closure last.
