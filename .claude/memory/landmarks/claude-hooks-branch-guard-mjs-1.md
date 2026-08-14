---
key: .claude/hooks/branch_guard.mjs:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: hook #26 (added 2026-07-03, erp-portables slice B). PreToolUse(Edit|Write|MultiEdit) guard blocking CREATION of `.claude/state/workflow.json` when `project.json → git.workflow_model` is `github-flow` and the current branch matches `git.release_branches` — so a workflow cannot start on `main` under PR-to-main discipline (Art. IV work-start + Art. VII topology). Early-warning at work-start only; `git_commit_guard` is the enforcing backstop at commit time (and catches Bash-driven writes this hook does not see). Composes the topology primitives single-sourced in `lib/common.mjs` (`resolveWorkflowModel` / `matchAnyGlob` / `isPrimaryWorkTree` / `currentBranch`) so the creation-gate cannot drift from the commit-gate. Fail-open on anything ambiguous: not-a-creation (file exists), configured:false, non-github-flow model, linked worktree, non-git, detached HEAD, or any read error — never bricks editing. Tests: `tests/branch-guard.test.mjs`.
