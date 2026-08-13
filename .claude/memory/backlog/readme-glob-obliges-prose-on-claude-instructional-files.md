---
key: readme-glob-obliges-prose-on-claude-instructional-files
category: backlog
scope: [document]
governs: .claude/project.json
status: open
raised-on: 2026-08-13
raised-in-context: skill-character-doctrine
source: assistant-deferral
deferred: human-directed
verified-at: e36bcb9
last-touched: 2026-08-13
---

> project.json document.surfaces matches **/README.md -> requires prose, but prose/SKILL.md refuses any file whose primary reader is Claude rather than a human.

- The `reference-section` rule globs `**/README.md`, which catches `.claude/memory/README.md` (the entry schema cited by CLAUDE.md Art. IX.1) and any future README under `.claude/`.
- The gate creates an obligation the delegate is forbidden to satisfy. Resolved this cycle via prose's mixed-file clause, which relies on the operator noticing.
- Narrow the glob to the root `README.md`, or add an `exclude` for `.claude/**`.
