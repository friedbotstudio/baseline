---
key: test-cmd-disagrees-with-the-binding-command-3d80
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: read-front-door-sweep
verified-at: 7f7b582
last-touched: 2026-08-09
governs: .claude/project.json, .claude/skills/integrate/SKILL.md, .claude/skills/verify/SKILL.md
---

> The config key and the binding command disagree, and that's worth a backlog entry.

- **The disagreement.** `project.json → test.cmd` is `node .claude/skills/audit-baseline/audit.mjs --file={file}` — a per-file structural check shaped for the `test_runner` PostToolUse hook. `/integrate` and `/simplify` are both told to read `test.cmd` and run it *without* the `{file}` placeholder, which yields the bare audit. But the audit is not the test suite: `npm test` runs `node --test --test-reporter=spec tests/*.test.mjs`, 2668 tests, and every `last_test_result` stamp in this repo records `npm test`.
- **Why it matters.** Following the SOP literally would stamp a binding PASS from the audit alone — roughly 130 structural checks — while 2668 behavioural tests went unrun. The verdict that `verify_pass_guard` treats as binding would attest to far less than a reader assumes.
- **Observed.** `read-front-door-sweep` ran `npm test` as the binding command at both `/simplify` and `/integrate`, and confirmed the audit separately, explicitly flagging the deviation each time.
- **Resolution shapes.** Either add a distinct key (`test.suite_cmd` for the full run, `test.cmd` staying per-file for the hook), or make `test.cmd` the full-suite command and give the hook its own per-file key. What is not viable is leaving one key to mean two different things depending on which consumer reads it.
