---
key: .claude/hooks/lib/glob-match.mjs
category: landmarks
scope: []
governs: .claude/hooks/lib/glob-match.mjs, .claude/hooks/lib/common.mjs, .claude/hooks/lib/write-set-profile.mjs, .claude/hooks/lib/write-surface.mjs, .claude/hooks/spec_design_calls_guard.mjs, .claude/skills/harness/rightsize-gate.mjs, .claude/skills/triage/governance-class.mjs, .claude/skills/spec-lint/lint.mjs
verified-at: c92f82a
last-touched: 2026-08-14
---

- Path: `.claude/hooks/lib/glob-match.mjs`. The one glob-to-RegExp compiler. Six hand-rolled copies collapsed into it (spec `globtoregex-shared-module-hoist`, 2026-08-14).
- Role: exports `globToRegex(glob, options?)` (anchored `RegExp`), `matchesAnyGlob(path, globs, options?)`, `expandBraces(globs)`, and the two bounds `MAX_STAR_RUN` (3) and `MAX_UNBOUNDED_SEGMENTS` (5). It imports nothing but node builtins, which is what lets every guard and skill rest on it without a cycle.
- **Three dialects are options, not a merge.** Default is D1. `{charClass: true}` keeps `[...]` a character class — `common.mjs` passes it for `git.protected_branches`, so widening it changes which branches demand a commit grant. `{segmentGlobstar: true}` makes `**/` match zero or more leading segments, so `**/*.md` matches a top-level `README.md`; only `rightsize-gate.mjs` asks for it.
- **The two bounds are enforced in different places, and that asymmetry is the point.** `MAX_UNBOUNDED_SEGMENTS` is the only compile-time refusal: the compiler throws a `RangeError` at 5. `MAX_STAR_RUN` is exported from here but enforced one layer out, in `write-surface.mjs → sanitizePatterns`, where a human declared the surface — a member that shape is malformed, not slow. The compiler collapses any star run to one `.*` instead, which is what two shipped `memory-scope-relevance-filter` tests already assert.
- Why the segment bound and not the run bound: collapsing cures one long run outright (measured 0.0 ms against a 120-character path), but six runs separated by literals still cost 45,952 ms after collapsing — `^.*x.*x.*x.*x.*x.*xb$` is exponential however each run was emitted. Four segments measure 96 ms in isolation, 429 ms inside the full parallel suite. The bound is what tracks that cliff.
- **A refused glob throws where callers previously got `false`.** `matchesAnyGlob` deliberately lets the `RangeError` propagate rather than reading it as no-match. It reaches a fail-open `catch` in `git_commit_guard` and `branch_guard`, so a malformed operator glob in `project.json` degrades to an allowed commit. Recorded LOW in `docs/archive/2026-08-14/globtoregex-shared-module-hoist/security.md`; the fix, if taken, belongs in the guard (resolve `isProtected = true`), never in the compiler.
- Behavior preservation rests on `tests/fixtures/glob-corpus.json` — 53 globs keyed PER CONSUMER, because `write-set-profile.mjs` already collapsed runs and `spec-lint/lint.mjs` differed from its D1 siblings on `***`. A single shared expectation table would have reported that difference as drift.
- Four vendored copies survive under `.claude/skills/impeccable/scripts/` (`live.mjs:229`, `live-inject.mjs:465`, `hook-lib.mjs:730`, `lib/impeccable-config.mjs:390`). Third-party, unreachable from any guard path, still exponential — out of scope by spec, and a vendor sync should carry the fix upstream rather than re-landing copies.
- Companions: [[.claude/hooks/lib/write-surface.mjs]], [[.claude/hooks/lib/common.mjs]], [[hook-sandbox-fixtures-use-an-explicit-cpsync-allowlist]].
