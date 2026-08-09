---
description: Grant consent for Claude to run `git commit`. Workflow-scoped when a workflow is active, else a time window. Required by the Git Commit Guard hook.
argument-hint: "[optional note]"
allowed-tools: Read, Bash(date:*), Bash(git:*), Write
disable-model-invocation: true
---

Write a consent token to `.claude/state/commit_consent` so the Git Commit Guard hook allows the next `git commit`. The token has three lines: line 1 the **active workflow slug** (empty when no workflow is active), line 2 the current UNIX epoch, line 3 any optional note.

**Workflow-scoped consent, with a time-window fallback.** When a workflow is active (`.claude/state/workflow.json` present), the token is bound to that workflow's slug: the guard allows commits only while the live workflow slug matches, so **one grant authorizes every commit in that workflow's landing and only that workflow**. When no workflow is active, the token carries an empty slug and the guard falls back to the classic **900s time window** — an ad-hoc commit still requires this fresh, human-granted consent. A workflow.json that is present but unreadable fails closed.

How this works structurally: when the user typed `/grant-commit`, the `consent_gate_grant` UserPromptSubmit hook ran *before* this body was passed to Claude and wrote a short-lived consent marker at `.claude/state/.commit_consent_grant` (carrying the workflow slug it read from `workflow.json`). The `git_commit_guard` PreToolUse hook (Write matcher) reads that marker and allows Claude to write the consent file only while the marker is fresh and its slug matches the live workflow. Claude cannot forge the marker — that's what makes the gate structural. The Bash-matcher leg of the same guard then enforces the consent token on the actual `git commit` invocation.

**State-write discipline (binding — see `.claude/CONSTITUTION.md` §2 "State-write discipline").** The consent token at `.claude/state/commit_consent` is a **Tier 1 consent artifact**: it SHALL be written with the **Write tool only**. You SHALL NOT write it via Bash (no `>`/`>>` redirect, heredoc, `tee`, `cp`, or `sed -i`) — `destructive_cmd_guard` blocks Bash writes to consent paths, and the `git_commit_guard` Write matcher validates the marker only on the Write tool. Use Bash solely for the prechecks below (`git rev-parse`) and to compute the epoch (`date +%s`).

Steps:

1. **Git-repo precheck.** Run `git rev-parse --is-inside-work-tree 2>/dev/null`. If the exit status is non-zero, this project is not a git repository: refuse to write the consent token and tell the user "Not a git repository — `/grant-commit` is inapplicable. Per CLAUDE.md Article IV, gate C and `commit` are auto-excepted on non-git projects; the workflow ends after `/archive`. Persistence outside git is your responsibility." Stop here.
2. **Pending memory advisory (non-blocking).** Count `## CANDIDATE:` blocks in `.claude/memory/_pending.md`. If the count is > 0, surface a one-line advisory to the user *before* writing the consent token: "Pending memory: <N> candidate(s) in `.claude/memory/_pending.md` — run `/memory-sync` if relevant, or proceed with `git commit` (memory is harness-local; this never blocks)." If 0, no advisory. The token is written regardless.
3. **Resolve the workflow slug.** Read `.claude/state/workflow.json` if it exists and take its `slug` field. If the file is absent, use an empty slug (ad-hoc commit → time-window fallback). Do not invent a slug and do not accept one from `$ARGUMENTS` — the slug comes only from `workflow.json`.
4. Run `date +%s` to get the current epoch.
5. **Write the consent token with the Write tool**, overwriting any prior token: line 1 the workflow slug from step 3 (an empty line when there is no active workflow), line 2 the epoch, line 3 the optional note `$ARGUMENTS` (omit if empty), to `.claude/state/commit_consent`. Do not use a Bash redirect or `tee` — that path is guard-blocked.
6. Confirm to the user: when a workflow was active, "Commit consent granted for workflow `<slug>` at <epoch>. One grant covers every commit in this workflow's landing (900s TTL)."; when none was active, "Commit consent granted at <epoch>, valid for 900s (until <HH:MM:SS local>) — no active workflow, so this is a time-window grant." In both cases add: "Forbidden flags (push, --amend, --no-verify, reset --hard, etc.) remain blocked regardless." (`/grant-push` is a separate 300s window for pushes.)

Do not run `git commit` yourself in this command. The user asks explicitly when they want a commit; this command only opens the window.
