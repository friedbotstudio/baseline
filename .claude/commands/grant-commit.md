---
description: Grant consent for Claude to run `git commit`. Valid for 5 minutes. Required by the Git Commit Guard hook.
argument-hint: "[optional note]"
allowed-tools: Bash(date:*), Bash(git:*), Write
disable-model-invocation: true
---

Write a consent token to `.claude/state/commit_consent` so the Git Commit Guard hook allows the next `git commit`. The token is the current UNIX epoch timestamp on line 1; any optional note goes on line 2.

How this works structurally: when the user typed `/grant-commit`, the `consent_gate_grant` UserPromptSubmit hook ran *before* this body was passed to Claude and wrote a short-lived consent marker at `.claude/state/.commit_consent_grant`. The `git_commit_guard` PreToolUse hook (Write matcher) reads that marker and allows Claude to write the consent file because the marker is fresh. Claude cannot forge the marker — that's what makes the gate structural. The Bash-matcher leg of the same guard then enforces the consent token on the actual `git commit` invocation.

**State-write discipline (binding — see `.claude/CONSTITUTION.md` §2 "State-write discipline").** The consent token at `.claude/state/commit_consent` is a **Tier 1 consent artifact**: it SHALL be written with the **Write tool only**. You SHALL NOT write it via Bash (no `>`/`>>` redirect, heredoc, `tee`, `cp`, or `sed -i`) — `destructive_cmd_guard` blocks Bash writes to consent paths, and the `git_commit_guard` Write matcher validates the marker only on the Write tool. Use Bash solely for the prechecks below (`git rev-parse`) and to compute the epoch (`date +%s`).

Steps:

1. **Git-repo precheck.** Run `git rev-parse --is-inside-work-tree 2>/dev/null`. If the exit status is non-zero, this project is not a git repository: refuse to write the consent token and tell the user "Not a git repository — `/grant-commit` is inapplicable. Per CLAUDE.md Article IV, gate C and `commit` are auto-excepted on non-git projects; the workflow ends after `/archive`. Persistence outside git is your responsibility." Stop here.
2. **Pending memory advisory (non-blocking).** Count `## CANDIDATE:` blocks in `.claude/memory/_pending.md`. If the count is > 0, surface a one-line advisory to the user *before* writing the consent token: "Pending memory: <N> candidate(s) in `.claude/memory/_pending.md` — run `/memory-flush` if relevant, or proceed with `git commit` (memory is harness-local; this never blocks)." If 0, no advisory. The token is written regardless.
3. Run `date +%s` to get the current epoch.
4. **Write the consent token with the Write tool**, overwriting any prior token: the epoch on line 1 (and the optional note `$ARGUMENTS` on line 2 if non-empty) to `.claude/state/commit_consent`. Do not use a Bash redirect or `tee` — that path is guard-blocked.
5. Confirm to the user: "Commit consent granted at <epoch>, valid for 900s (until <HH:MM:SS local>). The next `git commit` will be allowed; forbidden flags (push, --amend, --no-verify, reset --hard, etc.) remain blocked regardless." (900s is the `git_commit_guard` commit-consent TTL default; `/grant-push` is a separate 300s window for pushes.)

Do not run `git commit` yourself in this command. The user asks explicitly when they want a commit; this command only opens the window.
