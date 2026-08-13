---
key: rightsize-base-exclusion-misses-untracked-adds
category: backlog
scope: [tdd]
governs: .claude/skills/harness/rightsize-gate.mjs
status: open
source: assistant-deferral
raised-on: 2026-08-13
raised-in-context: standup-remote-freshness
verified-at: c53a121
last-touched: 2026-08-13
---

> `rightsize_base` excluded three pre-existing paths, but two still appear in `measured.touched` under their `/dev/null => path` rename form, so the base exclusion does not match untracked adds.

- `workflow.json → rightsize_base[]` records the paths already dirty at the workflow's first arm so pre-existing cruft does not inflate the change measure. Observed 2026-08-13: the array held 3 paths, and 2 of them still appeared in `measured.touched` rendered as `/dev/null => <path>` — the diff's rename form for an untracked add. The exclusion compares against the bare path and misses that shape.
- Severity: precision, not safety. Counting extra lines only ever makes the gate MORE conservative (it keeps phases it might otherwise skip), and the gate is additive-only and fail-open. On this workflow it kept `simplify`, `security` and `document`, all of which were wanted anyway.
- Fix shape: strip a leading `/dev/null => ` (and any `<old> => ` rename prefix) before testing a row's path against `rightsize_base`.
