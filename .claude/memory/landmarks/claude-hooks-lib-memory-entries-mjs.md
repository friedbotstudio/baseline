---
key: .claude/hooks/lib/memory-entries.mjs
category: landmarks
scope: [scout, memory-sync]
governs: .claude/hooks/lib/memory-entries.mjs
role: The one definition of how a flat memory file splits into entries, and of where an entry surfaces. Exports stripFrontmatter, entryKeyFromHeading, splitFlatEntries and surfacingPathsOf. Four readers (sweep.mjs, memory_session_start.mjs, shape.mjs, scoped-memory.mjs) carried private copies that drifted twice — on key derivation, where splitBlocks keyed on the first whitespace token while the other three took the whole heading, and on the sub-heading guard, where only shape.splitFlatIntoRecords knew a body may carry its own `## ` line. Every caller now imports; no private copy remains.
source: inferred-from-code
verified-at: e9a5893
last-touched: 2026-08-29
---

- **splitFlatEntries returns byte-exact substrings, and that is a contract rather than a style.** `sweep.mjs`'s `replaceBlock`/`deleteBlock` locate a block with `text.indexOf(block)` and return the text UNCHANGED on a miss. A normalization regression therefore does not throw — memory-sync silently stops writing and reports nothing. Never "tidy" the slicing into line-rebuilding.
- **surfacingPathsOf takes the first NON-EMPTY of `surfaces-on:`, then `governs:`, then a path-shaped `key:`.** First-non-empty, not first-present: an empty `surfaces-on:` must never shadow a populated `governs:`, or absence stops being inert and the field stops being additive.
- **The key fallback is load-bearing.** Only 8 of 92 category-default landmarks declare a path field; the other 84 reach a reader through that last branch alone. Removing it silences them.
- Both surfacing mechanisms resolve through this module rather than reading the fields themselves — [[a-wide-governs-glob-ripples-into-unrelated-literals]] records what happened when two sites applied the precedence independently.
