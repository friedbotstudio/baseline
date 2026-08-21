---
key: two-files-land-over-the-line-budget-2026-08-21-a3f5
category: backlog
scope: [simplify, integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-21
raised-in-context: unsanitised-path-pair
verified-at: a163ec5
last-touched: 2026-08-21
governs: site-src/velocity.njk, tests/ga4-events.test.mjs, tests/unsanitised-path-sinks.test.mjs, tests/site-constitutional-claims.test.mjs
deferred: human-directed
---

> go ahead with the recommendation

- **What was deferred.** The code-review fan-out returned BLOCKED on the `unsanitised-path-pair` branch with two `file_length` BLOCKERs: `site-src/velocity.njk` at 82 substantive lines (64 at HEAD) and `tests/ga4-events.test.mjs` at 85 (72 at HEAD). Neither is inherited debt, so `isInheritedDebt` returns false and `code-structure/oracle.mjs` rates both mandatory.
- **Why they were not trimmed.** The 80-line budget is a source-module rule that neither file kind fits. `velocity.njk` is a marketing page whose sections are prose, and `ga4-events.test.mjs` is a test file in a repository where 241 of 434 test files already exceed the budget with no carve-out. Splitting either along layer lines, the oracle's own suggested fix, would leave both worse.
- **Two more fall under the same deferral and were never measured.** `assembleChangedFiles` reads `git diff --name-only HEAD`, so untracked files are invisible to it: `tests/unsanitised-path-sinks.test.mjs` at 128 substantive lines and `tests/site-constitutional-claims.test.mjs` at 81, both new, both would rate mandatory if the input included them. See [[fanout-changedfiles-omits-untracked-files-6b07]].
- **Who decided.** The operator, on 2026-08-21, after the three alternatives (trim, defer, carve out) were named with their trade-offs.
- **The durable fix** is tracked at [[code-structure-line-budget-needs-a-file-kind-carve-out-7e2c]]. Until it lands, every branch touching a test or a page template pays this same BLOCKER.
