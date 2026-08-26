---
key: .claude/skills/harness/changed-files-shape.mjs
category: landmarks
scope: [scout]
governs: .claude/skills/harness/changed-files-shape.mjs
role: Holds assertChangedFilesShape, the one assertion on the code-review fan-out's input path that throws. Split out of assemble-context.mjs when that module crossed the 80-line budget and the code-structure checker blocked the landing. It validates a type rather than a git result — no file read, no command run — so it has no reason to change when a probe does. assemble-context.mjs re-exports it, so every existing import site is unchanged.
source: inferred-from-code
verified-at: 7d7039c
last-touched: 2026-08-26
---
