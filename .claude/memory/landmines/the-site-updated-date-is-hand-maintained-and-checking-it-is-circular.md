---
key: the-site-updated-date-is-hand-maintained-and-checking-it-is-circular
category: landmines
scope: [document, simplify]
source: assistant-deferral
raised-on: 2026-08-25
raised-in-context: docs-site review
verified-at: 5f52ba2
last-touched: 2026-08-27
governs: site-src/**,tests/site-updated-date-truth.test.mjs
---

- **The trap.** Every docs page carries an `updated:` value in its frontmatter, and `_layouts/docs.njk` renders it to the reader as "last updated &lt;date&gt;". Nothing derives it and, until 2026-08-25, nothing checked it. Editing a page without bumping the line leaves a page that states, in the reader's own words, that it is older than it is.
- **Measured 2026-08-25.** 14 of 17 pages carried a date earlier than their own last commit, several by nearly a month, and two had been edited that same day by the workflow that found it. Each was set to its real last-edit date rather than to today, because stamping today would assert a review of fourteen pages that nobody performed.
- **The check for it is circular if written the obvious way.** A page dirty in the working tree has no commit for that change, so today is the honest answer — which means correcting a wrong date is itself the edit that invalidates the corrected value, and the only way to satisfy the rule becomes stamping today on every page. `tests/site-updated-date-truth.test.mjs` therefore ignores a working-tree diff touching nothing but the `updated:` line. Anyone extending that test has to preserve the carve-out or the guard eats its own fix.
- The rule is one-directional on purpose. A date at or after the last edit is fine, since re-reading a page and changing nothing is an honest bump. A date **before** the last edit cannot be honest.
- Related: [[a-retrofit-guard-is-proven-by-re-breaking-what-it-guards]] — the guard was green when written and only meant something after a real content edit was staged and watched to fail.
