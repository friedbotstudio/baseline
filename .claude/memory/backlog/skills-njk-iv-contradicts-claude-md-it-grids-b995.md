---
key: skills-njk-iv-contradicts-claude-md-it-grids-b995
category: backlog
scope: [site-src]
status: open
raised-on: 2026-08-07
raised-in-context: system-spec-delta-slice-b
source: assistant-deferral
estimated-effort: small (editorial rewrite of one lead sentence + one grid cell)
verified-at: db121a1
last-touched: 2026-08-07
---

> skills.njk §IV contradicts CLAUDE.md — it grids `verify` among "five skills [that] call another skill" (verify calls none) and omits `technical-writer` entirely. Pre-existing, unrelated to this slice, and the fix is an editorial rewrite.

**The contradiction.** CLAUDE.md Article II names five execution skills that declare a mandatory sub-skill contract — `scenario`, `implement`, `design-ui`, `prose`, `technical-writer` — and says `verify` declares none because it is mechanical. `site-src/skills.njk:58` leads with "Five skills call another skill as part of their job, and four of those calls are mandatory", then grids `scenario`, `implement`, `design-ui`, `prose`, and `verify`. So the page counts a skill that calls nothing toward its own five, and drops the fifth skill that actually has a contract.

**Why it reads as deliberate but isn't.** The `verify` cell carries `cell-sand` styling and the copy "Mechanical. Declares no sub-skill." — the author clearly meant to show the contrast. The bug is the lead sentence counting it in, plus `technical-writer` never getting a cell.

**The fix.** Rewrite the lead to "Five skills call another skill" over the correct five, add a `technical-writer` cell (calls `technical-writing`, `reader-level`, `humanizer` — all mandatory), and keep the `verify` cell as an explicit counter-example outside the count.

**Related.** [[new-governed-files-are-anchored-at-the-concept]] — same class of drift, governance prose and its rendered surface diverging.
