---
description: Grant consent for Claude to run `git push`. Valid for 5 minutes. Required by the Git Commit Guard hook on protected branches.
argument-hint: "[optional note]"
allowed-tools: Bash(date:*), Bash(git:*), Write
disable-model-invocation: true
---

Write a consent token to `.claude/state/push_consent` so the Git Commit Guard hook allows the next `git push` on a protected branch. The token is the current UNIX epoch timestamp on line 1; any optional note goes on line 2.

How this works structurally: when the user typed `/grant-push`, the `consent_gate_grant` UserPromptSubmit hook ran *before* this body was passed to Claude and wrote a short-lived consent marker at `.claude/state/.push_consent_grant`. The `git_commit_guard` PreToolUse hook (Write matcher) reads that marker and allows Claude to write the consent file because the marker is fresh. Claude cannot forge the marker — that's what makes the gate structural. The Bash-matcher leg of the same guard then enforces the consent token on the actual `git push` invocation, but only when the current branch matches `project.json → git.protected_branches`.

**State-write discipline (binding — see `.claude/CONSTITUTION.md` §2 "State-write discipline").** The consent token at `.claude/state/push_consent` is a **Tier 1 consent artifact**: it SHALL be written with the **Write tool only**. You SHALL NOT write it via Bash (no `>`/`>>` redirect, heredoc, `tee`, `cp`, or `sed -i`) — `destructive_cmd_guard` blocks Bash writes to consent paths, and the `git_commit_guard` Write matcher validates the marker only on the Write tool. Use Bash solely for the precheck (`git rev-parse`) and the epoch (`date +%s`).

Steps:

1. **Git-repo precheck.** Run `git rev-parse --is-inside-work-tree 2>/dev/null`. If the exit status is non-zero, this project is not a git repository: refuse to write the consent token and tell the user "Not a git repository — `/grant-push` is inapplicable. Push has no meaning outside a git repo." Stop here.
2. Run `date +%s` to get the current epoch.
3. **Write the consent token with the Write tool**, overwriting any prior token: the epoch on line 1 (and the optional note `$ARGUMENTS` on line 2 if non-empty) to `.claude/state/push_consent`. Do not use a Bash redirect or `tee` — that path is guard-blocked.
4. Confirm to the user: "Push consent granted at <epoch>, valid for 300s (until <HH:MM:SS local>). The next `git push` on a protected branch will be allowed. Pushes on branches NOT in `project.json → git.protected_branches` do not require this consent."

Do not run `git push` yourself in this command. The user asks explicitly when they want a push; this command only opens the window.
