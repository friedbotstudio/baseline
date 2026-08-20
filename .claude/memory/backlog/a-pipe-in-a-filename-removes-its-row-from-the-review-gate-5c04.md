---
key: a-pipe-in-a-filename-removes-its-row-from-the-review-gate-5c04
category: backlog
scope: [simplify, integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-20
raised-in-context: changedfiles-shape-contract
verified-at: 2367f5e
last-touched: 2026-08-20
governs: .claude/skills/simplify/oracle.mjs
deferred: risk
---

> Closing one silent escape while leaving the other undocumented would misrepresent how tight that gate is.

- **The defect.** `tableRowCells` splits a verdict-table row on `|`. A path containing a pipe shifts every cell right, so cell 1 holds a filename fragment instead of `flagged`, the row is skipped, and the oracle returns zero findings for a file the reviewer explicitly flagged.
- **Measured.** A row for `a|b.mjs` yields `findings.length === 0`. A pipe is a legal filename character on macOS and Linux.
- **Pre-existing.** The parser before AC-009 broke on the same input for the same reason. It is recorded now because AC-009 closed its twin — an empty reason cell used to make a flagged row vanish identically, and that row now emits a BLOCKER.
- **A newline in a filename does the same thing** one layer up, in `assembleChangedFiles`: `git diff --name-only` quotes such paths and `.split('\n')` cuts them into fragments that fail their read and are dropped.
- **Fix shape.** Escape or reject a pipe in the file cell when the table is written, or parse with a delimiter a path cannot contain. Do not count cells from the right — a reason cell may legitimately contain a pipe too.
- **Source.** MEDIUM finding in `docs/archive/2026-08-20/changedfiles-shape-contract/security.md`.
