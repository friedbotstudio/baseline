---
key: spec-template-backticks-an-anchor-spec-lint-rejects
category: landmines
scope: [spec]
governs: .claude/skills/spec/template.md,.claude/skills/spec-lint/lint.mjs
verified-at: 02412dc
last-touched: 2026-08-07
superseded-at: 2026-08-07
---

- Path: `.claude/skills/spec/template.md:279-281` (the `## System delta` example rows) against `spec-lint/lint.mjs:257` (`anchorDefects`).
- Landmine: **the shipped template writes delta anchors in backticks; `spec-lint` rejects them.** The template's own example is `` | add | foo-guard | `.claude/hooks/foo_guard.mjs` | guard-substrate | c4_component | ``. `parseDelta` keeps the cell verbatim, so the anchor string carries its backticks into `anchorMatches`, the glob fails to match any governed path, and the row FAILs with `anchor ... falls outside the governed surface` — a message that names the wrong cause and sends the author looking at `governed_surface` config rather than at a pair of backticks.
- Observed 2026-08-07 authoring the retroactive `## System delta` section on `docs/specs/system-spec-delta.md`. Copying the template's row shape produced an immediate FAIL; deleting the two backticks produced `system_delta PASS 1 delta row(s) resolve`. Nothing else changed.
- Why it hides: every OTHER path-bearing field in a spec is conventionally backticked, and the template reinforces that. The failing message points at the governed surface, which is the one thing that is correct.
- Real fix (one of two, pick deliberately): strip surrounding backticks in `parseDelta`'s cell reader so both forms work, OR fix the template's example rows to be bare. Stripping is the friendlier option and matches how the rest of the corpus treats markdown decoration; fixing only the template leaves every hand-written backticked row failing with the same misleading message.
- **Resolution 2026-08-07, workflow `epic-child-pin-and-delta-backticks`.** The maintainer chose the strip. `parseDelta`'s `splitCells` now runs each cell through `undecorate`, anchored to the ends (`/^`(.*)`$/s`), so both forms parse and an interior backtick stays content. The template is unchanged, which is the point of choosing this option. A regression test pins all three cases: bare, backticked, interior-backtick.
- Sibling: [[a-required-section-locks-out-every-spec-that-predates-it]] — found in the same fifteen minutes, both from the same act of editing an old spec for the first time since the delta rules landed.
