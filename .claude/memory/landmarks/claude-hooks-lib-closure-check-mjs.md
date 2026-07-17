---
key: .claude/hooks/lib/closure-check.mjs
category: landmarks
scope: [scout]
caveat: MUST stay shipped in `obj/template/.claude/manifest.json` — if dropped, `git_commit_guard`'s import crashes and the guard fails OPEN (consent bypass). Defended by `audit-baseline` + `tests/closure-amendment-governance.test.mjs`. See landmine `guard-new-lib-dep-breaks-sandbox-copy-tests`. Behavior documented in seed.md §4.1 + CLAUDE.md Art VIII + annex; RCA `docs/rca/2026-06-06-backlog-closure-stamp-stranded-post-commit.md`.
---

- Path: `.claude/hooks/lib/closure-check.mjs`
- Role: Foundation module — pure backlog-closure stamp reader + staged-tree obligation evaluator. Exports `unsatisfiedKeys(backlogText, keys)` and `evaluateClosure({stagedPaths, readStaged})`; no git, no I/O (callers inject staged content). Single source of truth (spec D3) imported by BOTH `git_commit_guard.mjs` (the atomic-closure hard-block leg) and `.claude/skills/commit/closure-precommit-check.mjs` (the `/commit` SOP preflight + `Closes <key>` reconciliation).
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
