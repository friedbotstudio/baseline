---
key: .claude/skills/harness/checkers/backlog-deferral.mjs
category: landmarks
scope: [scout]
governs: .claude/skills/harness/checkers/backlog-deferral.mjs
role: Code-review checker requiring a deferred: reason on any source: assistant-deferral backlog entry. Enforce-on-touch is not coded anywhere in it — changedFiles is the only input, so an entry the diff never touched is never read. Terminal-safety is no longer local: the former safe() was extracted into clip in .claude/skills/lib/terminal-text.mjs, which this file imports at :7. That module strips C0/C1 before the whitespace collapse because ESC and BEL are not whitespace.
source: inferred-from-code
verified-at: 1b4c320
last-touched: 2026-08-20
---


