---
key: a-global-regex-with-test-fails-open-on-alternate-calls
category: landmines
load_bearing: true
scope: [security, implement, simplify, integrate]
governs: .claude/skills/lib/**, .claude/skills/roadmap/**, .claude/skills/roadmap-sync/**, .claude/hooks/**
verified-at: 19631b7
last-touched: 2026-08-17
---

- **The trap.** `.test()` on a regex carrying the `g` flag advances `lastIndex` and returns **false on every second call** for the same input. A regex used as a *predicate* must never be global.
- **Why it is a security bug, not a style bug.** `assertInert` (the CWE-74 roadmap-grammar guard) rejects a value carrying a status emoji. If its emoji regex were global, the guard would accept a forged title on alternate calls — a guard that fails **open**, intermittently, which is worse than one that never existed because the test suite passes on the odd call.
- **How it nearly landed.** Before the 2026-08-17 hoist, `sync.mjs`'s status-emoji regex carried `g` (it scans and replaces) and `append.mjs`'s did not (it tests). Merging them into one shared export is the obvious move and would have exported the global one.
- **The shape that is correct.** `.claude/skills/lib/epic-heading.mjs` exports `STATUS_EMOJI` **non-global** for predicate use, and a `statusEmojiScanner()` factory that returns a **fresh** global regex per call for scan/replace use. No mutable regex state crosses a call site. `sync.mjs` calls the factory inline at each of its four use sites rather than hoisting one scanner to module scope.
- **Verified by measurement, not by reasoning** (`/security`, 2026-08-17): `assertInert('Ship ✅ now')` called six consecutive times rejected 6/6; two `statusEmojiScanner()` calls returned distinct objects with independent `lastIndex`. Pinned by AC-006 and AC-007 in `tests/epic-heading-grammar.test.mjs`.
- **Practical rule.** Before sharing a regex across modules, classify each use as predicate or scanner. Predicate → non-global constant. Scanner → factory returning a fresh regex. Never one global constant serving both.
- Related: [[the-epic-heading-grammar-has-one-declaration-site]].
