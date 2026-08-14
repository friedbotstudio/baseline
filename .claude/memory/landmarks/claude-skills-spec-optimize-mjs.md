---
key: .claude/skills/spec/optimize.mjs
category: landmarks
scope: []
governs: .claude/skills/spec/optimize.mjs, .claude/skills/spec/cli.mjs
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/spec/optimize.mjs`. Domain — diffs a drafted spec against the standing model at `docs/system/`. Reached from `/spec` Step 6.5 via `node .claude/skills/spec/cli.mjs optimize --slug <slug>`.
- Role: exports `analyzeSpec({specPath, rootDir})` returning three arrays, `assertSafeSlug`, and `CorpusMissingError`. The three findings answer different questions: `undeclared` (write_set touches an element no `## System delta` row names), `reuse` (an element already models this anchor, so extend rather than rebuild), `corrections` (a `change`/`remove` row whose element id does not resolve).
- **It reads and reports; it never writes a spec byte.** That boundary is Article II — a helper editing the spec would move a written decision out of main context. `tests/spec-optimize.test.mjs` hashes the file either side of the call, which is the only thing that keeps the boundary honest.
- **Two imports cross trees, and both are deliberate reuse, not convenience.** `parseDelta` comes from `.claude/skills/workspace/delta.mjs` and `extractWriteSet` from `.claude/hooks/lib/write-set-profile.mjs`. Both were re-implemented locally first and replaced at `/simplify` on 2026-08-09; a second copy of either is how the guard and `/spec-lint` came to disagree about the same bytes before. `extractWriteSet` was private until this cycle exported it.
- `assertSafeSlug` REJECTS, never repairs (CWE-22). `canonicalSlug` in `common.mjs` is a normalizer; routing a malformed slug through it would silently resolve to a different valid path, which is the traversal rather than the fix.
- Known limitation, not a defect: `overlapsWriteSet` matches on non-wildcard directory prefixes, so a broad write_set such as `.claude/skills/**` overlaps nearly every element. Run against this repo's own harness-batch-fixes spec it returned 108 undeclared / 113 reuse. Faithful to AC-015, but a report that size trains an author to ignore it.
