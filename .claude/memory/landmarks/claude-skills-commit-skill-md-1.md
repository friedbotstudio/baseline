---
key: .claude/skills/commit/SKILL.md:1
category: landmarks
scope: [scout]
---

- Role: Phase 11 workflow skill. Stages the diff and runs `git commit` with the message via HEREDOC; the `git_commit_guard` Bash-time hook enforces consent independently. Prereq line 8: BOTH `archive` AND `memory-flush` in `workflow.json → completed` (or in `exceptions`). Step 1 archives `workflow.json` into the slug bundle as the first move; Step 2 verifies memory-flush is the final non-commit entry; Steps 3–7 stage named paths, draft message (humanizer pass on the body), and commit. Non-git projects auto-except this skill at triage time.
- Companion: `.claude/hooks/git_commit_guard.mjs:1` (consent enforcement at the Bash boundary), `.claude/skills/archive/SKILL.md:1` (Phase 10.5 sibling), `.claude/skills/memory-flush/SKILL.md:1` (Phase 10.6 sibling whose completion this skill's prereq depends on).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: never `git add -A` / `git add .` (seed.md Pillar 5 forbids both); always stage named paths. Never `git commit --amend` or pass `--no-verify`/`--no-gpg-sign` unless the user explicitly named the operation in their current request. The phase-prereq tightening to require `memory-flush` (added 2026-05-17 with the Phase 10.6 wiring) is structurally enforced by this skill's prose — `git_commit_guard` does not duplicate the check.
