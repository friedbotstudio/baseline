---
key: recap-detail-degrades-at-a-threshold-2026-08-13
category: decisions
scope: [implement, simplify]
governs: .claude/skills/standup/render.mjs
verified-at: 87d3573
last-touched: 2026-08-13
---

- Decision: `/standup`'s rendered recap prints per-item detail **below** a bound and degrades to counts above it, rather than collapsing at every size. `COMMIT_DETAIL_MAX = 20` for unreleased commits, `OPEN_TASK_DETAIL_MAX = 20` for open roadmap rows, both in `render.mjs`. Owner: engineer, chosen at triage as decision D2.
- Why not collapse always: that was the prior behaviour and it cost a second `--json` pass to answer "what is actually in this pile?" for a four-commit pile. Why not print always: a 70-commit dump is precisely the wall of text `render.mjs`'s header comment says the CLI exists to remove. The threshold keeps both halves of that principle.
- **20 is not arbitrary and should not be "tidied" upward.** `tests/standup-render.test.mjs:85-99` asserts that 49 commits render **zero** per-commit lines. Any bound at or above 49 flips that pre-existing assertion red. If the number ever needs to move, move that test deliberately and say why.
- The open-row budget is measured across the **whole plan**, not per epic (`totalOpenRows`), because eight epics carrying four open rows each fill a screen as fast as one epic carrying thirty-two.
- Rejected alternatives, both recorded at triage: *always print, truncate each line* (prints 70 lines in the case that motivated the rule) and *open items only, no commit subjects* (closes the commit-detail gap as won't-fix and leaves `--json` the only route to subjects).
