---
key: .claude/skills/lib/terminal-text.mjs
category: landmarks
scope: []
governs: .claude/skills/lib/terminal-text.mjs, .claude/skills/standup/render.mjs, .claude/skills/harness/checkers/backlog-deferral.mjs, .claude/skills/roadmap/render.mjs
verified-at: 05d8fec
last-touched: 2026-08-24
---

- Path: `.claude/skills/lib/terminal-text.mjs`. Foundation — the one place a repository-controlled string is made safe to print. Fourth module in `skills/lib/`, after `probe.mjs`, `argv.mjs` and `output.mjs`.
- Role: exports `clip(text, width = 96)`. It replaces C0/C1 control characters with a space, collapses whitespace runs, trims, and truncates to `width` with a trailing `…`. Non-string input is coerced; `null` and `undefined` become the empty string.
- **The ORDER is the contract, not an implementation detail.** Controls are replaced with a space BEFORE whitespace collapses. ESC and BEL are not whitespace, so a collapse-then-strip implementation passes a naive "no ESC in the output" assertion and still leaves the double space the control occupied. `tests/terminal-text.test.mjs` asserts the exact output rather than the absence of controls, which is what makes the order testable.
- **The character class is built from a string, deliberately.** `new RegExp('[\\u0000-...]')` rather than a regex literal, so a consumer that kept a local copy can be found by searching for the literal form. The anti-drift assertion in `tests/terminal-text.test.mjs` depends on that: a shared module with the old copies still in place is worse than either state alone.
- Hoisted at the third concrete use (`code-structure` abstract-at-three), from byte-identical copies in `standup/render.mjs` (`clip`) and `harness/checkers/backlog-deferral.mjs` (`safe`). The third consumer is `roadmap/render.mjs`. Closes backlog `terminal-sanitizer-duplicated-across-standup-and-deferral-checker`.
- Related: [[claude-skills-lib-argv-mjs]], [[a-raw-control-byte-separator-makes-a-source-file-binary-to-git]].
