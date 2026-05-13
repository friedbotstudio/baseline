---
name: commit
owner: baseline
description: Workflow Phase 11 — Commit Preparation and Execution. Stages and commits the work. Requires `/grant-commit` first (Git Commit Guard enforces a 5-min consent window).
argument-hint: "[optional commit message; otherwise drafted from the spec/intake]"
---

Prereq: `archive` in `completed` (i.e., Phase 10.5 has moved all slug artifacts to `docs/archive/<date>/<slug>/`) AND a valid consent token at `.claude/state/commit_consent` (the Git Commit Guard hook enforces this independently).

**Applicability.** This skill applies only when the project is a git repository. Non-git projects auto-except `commit` at `/triage` time (CLAUDE.md Article IV); the workflow ends after `/archive`.

Steps:

0. **Git-repo precheck.** Run `git rev-parse --is-inside-work-tree 2>/dev/null`. If exit non-zero, exit cleanly with: "Not a git repository — `/commit` is inapplicable. Per CLAUDE.md Article IV, `commit` is auto-excepted on non-git projects; the workflow ended at `/archive`. Persistence outside git is your responsibility." Do not run any subsequent step.
1. **Archive `workflow.json` itself.** This is the final piece of the archival bundle, held back until now so phase-ordering checks worked up through this point. Read `.claude/state/workflow.json` to get the slug, then move the file into the already-existing archive bundle: `docs/archive/<date>/<slug>/workflow.json`. Use the bundle's `<date>` directory (the one `/archive` created — inspect `docs/archive/` to find the most recent bundle matching the slug).
2. Verify workflow prereq: `archive` is the final non-commit entry in `completed`; no open consent gates remain.
3. `git status` + `git diff --stat` to confirm the change set. The diff now includes: production code changes + archive bundle additions + the workflow.json move. Stage named paths explicitly (never `git add -A` / `git add .` — seed.md forbids it).
4. Draft the commit message from the spec + diff. Conventional-style prefix (`feat:` / `fix:` / `refactor:` / `docs:` / `test:`) followed by a 1-line summary and a short body explaining the WHY. The subject line is a fixed-register one-liner — leave it alone. The body is reviewer-facing prose — pass it through `Skill(humanizer)` before step 5 so AI-writing tells (em-dash overuse, rule of three, inflated verbs, vague attributions) get scrubbed. Keep the brief tight: tell humanizer the register is "factual reviewer-facing commit body — describe the diff faithfully, do not invent rationale, preserve any spec quotes verbatim".
5. Run `git commit` with the message via HEREDOC. The Git Commit Guard hook will verify consent. If consent is missing/expired, stop and ask the user to run `/grant-commit`.
6. Do NOT run `git push`, `git commit --amend`, or pass `--no-verify`/`--no-gpg-sign` unless the user explicitly named the operation in their current request.
7. Append `"commit"` to `completed` — but note this only matters for logs; the workflow.json is now in the archive and the live `.claude/state/workflow.json` no longer exists. Report the commit SHA to the user.
