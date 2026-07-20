---
key: js-string-replace-dollar-injection-corrupts-blocks
category: landmines
scope: [scout, spec, tdd, security, integrate]
caveat: same hazard exists anywhere in the codebase that does `X.replace(<dynamic string>, <content-with-$>)`; this entry documents the sweep.mjs instance but the rule is general to JS.
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Path: `.claude/skills/memory-flush/sweep.mjs` — `replaceBlock(text, block, updated)` (the $-safe splice, line 140) vs the `deleteBlock` sibling (line 125); the six block-mutating call sites in `modeStampClosure`, `applyStaleAction` (re-verify + mark-closed), and `modeBacklogDecay` (keep/drop/picked-up).
- Trap: `String.prototype.replace(searchString, replacementString)` interprets `$\``, `$'`, `$&`, `$$`, `$n` IN THE REPLACEMENT string — it is NOT a literal substitution. Memory entry bodies legitimately contain shell snippets with `$`-sequences (e.g. `${TMPDIR:-/tmp}`, backtick-dollar), so `text.replace(block, updated)` where `updated` is derived from such a block re-injects pre-match (`$\``), post-match (`$'`), or the whole match (`$&`) and DUPLICATES the entry. Observed live: a stale-sweep restamp grew `landmarks.md` 64→214 entries. The duplicate often lands MID-LINE (spliced into the line that held the `$`-sequence), so a line-anchored `^##` heading count misses it — assert via a unique sentinel's occurrence count instead.
- Mitigation: never use `String.replace(str, str)` for content-bearing splices. Use an `indexOf`/`slice` splice (`text.slice(0,idx) + updated + text.slice(idx+block.length)`) or a FUNCTION replacer `(…) => updated` (function replacements never interpret `$`). `deleteBlock` was always safe (slice-based); `updateField`/`appendField` are safe (function/array). Regression: `tests/sweep-replace-dollar-injection.test.mjs` (4 modes, sentinel-count assertion). Companion: [[baseline-skill-edit-needs-manifest-rebuild]] (editing this baseline skill needed `npm run build` to reconcile the manifest hash before the audit passed).
