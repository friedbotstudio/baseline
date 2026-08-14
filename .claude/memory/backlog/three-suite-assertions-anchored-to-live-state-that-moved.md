---
key: three-suite-assertions-anchored-to-live-state-that-moved
category: backlog
scope: [tdd, integrate]
governs: tests/**
status: picked-up
raised-on: 2026-08-13
raised-in-context: standup-recap-single-pass
source: assistant-deferral
verified-at: 87d3573
last-touched: 2026-08-13
superseded-at: 2026-08-14
---

> Three suite failures were confirmed pre-existing by restoring the unmodified source and re-running: they reproduce against untouched code, so they are not regressions from this workflow.

- `tests/memory-readers-sharded.test.mjs:127` — `test_when_sharded_pending_questions_then_gather_returns_question` asserts `/Q-002/` against the **live** corpus, which now carries only `Q-003`. This is the "never anchor a test to live repo state" trap the scenario skill-memory already names; the entry it asserts on was legitimately resolved and removed.
- `tests/memory-scope-store-invariants.test.mjs` — `test_when_path_leg_measured_then_governs_hit_counts_unchanged` and `test_when_phase_budgets_measured_then_within_stated_caps`. Both are numeric literals over a store that keeps moving. Per the census/budget distinction already recorded in the scenario skill-memory, the first is a **census** (re-measure it and name the commit that moved it) and the second is a **budget** (policy, so re-measuring to today's value silently converts it into a tripwire with zero headroom).
- These three do **not** gate a commit today, and that is the second half of the finding: `project.json → test.cmd` is the governance audit, not `node --test tests/*.test.mjs`, so the binding `last_test_result` verdict never runs the node suite at all. `/integrate` stamps PASS from the audit while three suite assertions are red.
- Worth deciding as one item: either repair the three assertions, or make the binding test command cover the node suite so failures like these cannot sit unnoticed. Repairing them without closing the coverage gap leaves the next three to accumulate the same way.
