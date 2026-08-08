---
key: .claude/hooks/process_lifecycle_guard.mjs:50
category: landmarks
scope: []
governs: .claude/hooks/process_lifecycle_guard.mjs, .claude/hooks/lib/scoped-memory.mjs, .claude/hooks/lib/governed-memory.mjs
load_bearing: true
verified-at: 39464a1
last-touched: 2026-08-04
---

- Path: `.claude/hooks/process_lifecycle_guard.mjs`. Advisory PreToolUse hook on Bash + Edit/Write/MultiEdit (CLAUDE.md Article VIII, Article IX.7). Never blocks.
- Role, Bash leg: matches `TRIGGERS` against the command and surfaces landmine excerpts before it runs. Write leg: surfaces memory before the write, through **two** triggers.
  - `surfacePhaseScopedMemory` → `phaseForPath()` maps a `docs/<phase>/` prefix to a workflow phase and surfaces facts tagged `scope: <phase>`.
  - `surfaceGovernedMemoryFor` → the path-keyed trigger (epic D3): surfaces entries whose `governs:` globs match the file being written.
- **This hook carries the second trigger instead of a 27th hook existing.** The baseline's hook count (26) is a constitutional figure in Article VIII and in `audit-baseline`; extending an existing advisory hook kept it fixed. Do not add a hook to add a trigger.
- Both surfacing helpers are **terminal** — every branch exits via `emitAllow()`, which is `process.exit(0)`. That makes the two triggers mutually exclusive, which is a real behavioural constraint, not a detail: see the `governs-globs-under-a-phase-prefix-never-surface` landmine.
- Companion: `.claude/hooks/lib/scoped-memory.mjs` (phase trigger), `.claude/hooks/lib/governed-memory.mjs:51` (path trigger).
