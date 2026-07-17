---
key: .claude/hooks/phase_timer.mjs
category: landmarks
scope: [scout]
caveat: fires on EVERY Write/Edit/MultiEdit AND every Bash call in the repo; the basename guard (Write leg) and idempotent `stampFromWorkflow` (both legs) keep the no-op cheap. Covers manual/Bash-driven phase runs too, not just `/harness`.
---

- Path: `.claude/hooks/phase_timer.mjs`
- Role: PostToolUse observe-only hook (the 25th hook) with two legs. Write|Edit|MultiEdit leg: no-ops unless `basename(tool_input.file_path) === 'workflow.json'`, then calls `stampFromWorkflow`. **Bash leg** (`phase-timer-bash-trigger`): on `tool_name === 'Bash'` it skips the basename check and unconditionally calls the idempotent `stampFromWorkflow`, so Bash-driven `workflow.json` mutations (the manual-harness `>`/node-fs/jq path) also stamp — closing the gap where Write-only matching silently lost timing for human/Bash-driven runs. Try/catch swallowed; never blocks (PostToolUse has no deny path), never mutates the edited file. Wired in `settings.json` + `src/settings.template.json` (a Write/Edit/MultiEdit matcher AND a Bash matcher) beside `lint_runner`/`test_runner`.
- Companion: `.claude/hooks/lib/timing.mjs` (logic), `docs/init/seed.md §4.1` + `CLAUDE.md` Article VIII (governance rows).
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
