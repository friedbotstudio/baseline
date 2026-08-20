---
key: spec-optimize-undeclared-is-directory-wide-noise-8b3d
category: backlog
scope: [spec]
governs: .claude/skills/spec/optimize.mjs, .claude/hooks/lib/write-set-profile.mjs
status: open
raised-on: 2026-08-20
raised-in-context: unborn-branch-consent-blindness
source: assistant-deferral
estimated-effort: low
verified-at: d23c06b
last-touched: 2026-08-20
---

> verbatim (assistant, 2026-08-20):
> "`patternsOverlap` widens each side to its directory prefix, so naming one file under `.claude/hooks/` matches every element anchored anywhere in that directory. The advisory is noise here, not a signal I ignored."

- Intent: Make `/spec`'s optimization pass report `undeclared` against the files a write_set actually names. `optimize.mjs:78 undeclaredElements` calls `patternsOverlap(el.anchor, p)`, which runs both sides through `directoryPrefix` and then tests `startsWith` in either direction — so a write_set naming the single file `.claude/hooks/git_commit_guard.mjs` overlaps every element anchored anywhere under `.claude/hooks/`.
- Measured at `d23c06b` on `docs/specs/unborn-branch-consent-blindness.md`: a five-file write_set produced **57 undeclared rows** and 57 `reuse` rows, against a change that altered exactly two elements. Both real ones were already declared; `corrections` was 0.
- The bidirectional rule is deliberate for the anchor-vs-write_set question and is documented as such at `write-set-profile.mjs:43-46`, which notes the one-directional `pathOverlapsWriteSet` exists beside it precisely because the bidirectional one "would match every sibling in that directory". `undeclaredElements` is the call site that wants the stricter predicate.
- Consequence if left: the pass is advisory and never blocks, so the failure mode is a maintainer learning to skim past 57 rows and missing the one that matters.
