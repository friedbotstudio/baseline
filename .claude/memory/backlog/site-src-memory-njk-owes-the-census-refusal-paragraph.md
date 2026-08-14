---
key: site-src-memory-njk-owes-the-census-refusal-paragraph
category: backlog
scope: []
governs: site-src/memory.njk
status: open
source: assistant-deferral
deferred: human-directed
raised-on: 2026-08-14
raised-in-context: release-readiness
verified-at: 66fcb29
last-touched: 2026-08-14
---

> The public memory page describes one refusal and there are now two. The second was written, then reverted, because the page is outside the approved write set.

- **What the page says today.** `site-src/memory.njk:94` describes the verbatim refusal: a candidate claiming to come from you without a quote is refused and stays a candidate. That paragraph is the right register and the right shape for a sibling.
- **What it does not say.** `/memory-sync` now carries a second refusal at Step 4.7 — a flush that would move a pinned count re-measures it in the same commit or refuses and names the site. The reader-facing value is that a number describing their store stops going stale behind them.
- **Why it is filed rather than landed.** The `release-readiness` write set names thirteen paths and `site-src/**` is not among them; the paragraph was written during `/document` and reverted on that ground. `project.json → document.surfaces` also requires `technical-writer` + `copywriting` for that surface, so this is a two-delegate page pass rather than a paragraph insert.
- **Do not land it before [[census-gate-literal-pattern-matches-no-real-site]].** The gate refuses on every real site today, so a page claiming it re-measures would describe an outcome no reader can currently observe. Describe the behaviour once the behaviour reaches the sites.
