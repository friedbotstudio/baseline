---
key: .claude/hooks/lib/governed-memory.mjs:51
category: landmarks
scope: any
governs: .claude/hooks/lib/governed-memory.mjs,.claude/hooks/process_lifecycle_guard.mjs,.claude/hooks/lib/entry-body.mjs
load_bearing: true
verified-at: 39464a1
last-touched: 2026-08-04
---

- Path: `.claude/hooks/lib/governed-memory.mjs`. The path-keyed surfacing trigger (spec ticket C, epic decision D3).
- Role: exports `surfaceGovernedMemory(filePath, {rootDir})` — resolves `by_path` through the derived index, then hydrates each structural match with `load_bearing:`, verbatim, interpretation and first hook — and `renderGovernedHits(hits)`, which switches from full verbatim to a summary plus a walkable entry point above `VERBATIM_LIMIT` (3, AC-007, same threshold as the phase trigger).
- Why it exists: `PHASE_BY_PREFIX` in `process_lifecycle_guard` has no non-`docs/` entry, so editing a **source** file surfaced nothing by construction — the reason a piece of code is shaped a given way was unreachable at exactly the moment someone was about to change it.
- This is a **second** trigger beside the phase one, not a widening of it. `scope:` keeps meaning workflow phases and `scopedFactsIn` stays a straight membership test; `governs:` carries path globs. Two clean vocabularies at the cost of one code path, rather than one field holding two kinds of value with every reader discriminating.
- Hydration is **per-entry** isolated: a malformed shard is skipped, its siblings still surface. A per-*category* `try` silently suppressed every decision in the category (security review F-1).
- Advisory and fail-open throughout — every path returns `[]` rather than throwing, matching the `surfaceScopedMemory` contract, so an unmigrated consumer install no-ops instead of breaking.
- Companion: `.claude/skills/memory-index/resolve.mjs:59` (the index it reads), `.claude/hooks/lib/entry-body.mjs` (the verbatim/interpretation split, Article IX.6 made mechanical), `.claude/hooks/process_lifecycle_guard.mjs:50` (its caller). See the `governs-globs-under-a-phase-prefix-never-surface` landmine before adding a `governs:` glob.
