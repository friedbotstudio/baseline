---
key: .claude/skills/lib/output.mjs
category: landmarks
load_bearing: true
scope: []
governs: .claude/skills/lib/output.mjs, .claude/skills/lib/argv.mjs
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/lib/output.mjs`. Foundation — the presentation half of the shared dispatcher layer: `renderUsage(name, subcommands)` and `emit(result, json, sink)`. Third module in `skills/lib/`, after `probe.mjs` and `argv.mjs`.
- Why it is a separate file: split out of `argv.mjs` at the code-review `file_length` finding (83 substantive lines against the ~80 ceiling). The line count is what surfaced it; the split stands on the layer model — neither function consults argv or decides an exit code.
- **`renderUsage` is re-exported from `argv.mjs`, and that re-export is load-bearing.** It shipped as a public export of `argv.mjs` in `4cc46e0`, so removing it there would break a consumer that already imports it. `tests/cli-argv.test.mjs` asserts the two are the SAME function object, not two copies that can drift.
- `emit()` writes `result.text` **verbatim, with no trailing newline added**, because `workspace view` returns a composed PlantUML document whose bytes a test compares against `composeView` directly. Adding a newline here breaks that equality for every artifact-emitting subcommand.
- `emit()` takes an injectable `sink` defaulted to `process.stdout`. Nothing on the shipped path passes a second sink; it exists so the verbatim-write contract is testable without capturing process stdout.
- Related: [[claude-skills-lib-argv-mjs]] owns argv and the exit contract.
