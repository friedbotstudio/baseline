---
key: site-install-claim-omits-the-output-style-7f3a
category: backlog
scope: [document]
source: assistant-deferral
status: open
raised-on: 2026-08-07
raised-in-context: ship-baseline-output-style
verified-at: 704befc
last-touched: 2026-08-07
---

> site-src/overview.njk and index.njk make a "what it installs" claim driven by baseline.cjs -> derive-counts.mjs, which audit-baseline also cross-checks. The output style was added to README.md but NOT to those site surfaces, because extending the shared audit-critical deriver was judged out of scope this cycle. Deliberately deferred, not forgotten.

- `README.md` now names the Baseline output style in both its `## What this is` claim and its `## What gets installed` table. The public site's equivalent sentence (`site-src/overview.njk:26`, echoed at `site-src/index.njk:222`) does not.
- **Why it was deferred rather than done.** Those counts come from `site-src/_data/baseline.cjs`, which calls `deriveCounts()` in `.claude/skills/audit-baseline/derive-counts.mjs` — the same module `audit-baseline` cross-checks its own count assertions against. Adding an `outputStyles` key means editing an audit-critical shared deriver to add one noun to one sentence.
- **Why it is not urgent.** The site sentence is an abbreviated pitch, not an inventory: it already omits MCP servers and memory files. So it under-describes rather than contradicts, and no audit check fails today.
- **What doing it looks like.** Extend `deriveCounts` with an output-styles count read from `.claude/output-styles/`, surface it in `baseline.cjs`, then add it to the `overview.njk` sentence. Verify `audit-baseline` count checks still pass.
- Worth folding into the next governance-count sweep rather than running as its own workflow.
