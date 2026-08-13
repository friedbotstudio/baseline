---
key: roadmap-t11-quotes-two-counts-that-have-both-moved
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-13
raised-in-context: diagram-shard-rewrite-loses-fields
verified-at: 79e41cb
last-touched: 2026-08-13
governs: docs/roadmap-execution-plan.md
---

> `docs/roadmap-execution-plan.md` Epic 6 T11 claims "a test locks the count at exactly 87" and "Scout therefore still surfaces 96". Measured now: 88 and 98.

- **The work.** Correct both numbers in T11's body, or better, stop quoting them. It is a one-line prose edit to the roadmap's only open task.
- **Why it is filed rather than fixed.** `/roadmap-sync` writes only through `syncRoadmap` and is forbidden from hand-editing the roadmap, so the phase that found the drift is the phase that may not repair it.
- **Why the numbers moved.** `79e41cb` added a `[scout]`-scoped landmark (87 → 88), and `diagram-shard-rewrite-loses-fields` bumped the test literal T11 cites as its own tripwire. Scout's surfaced count moved 96 → 98 for the same reason.
- **The claim still holds.** A test does still lock the count, so the deferral cannot drift closed unnoticed. Only the roadmap's copy of the number is wrong — a third hand-maintained duplicate of a live count. See [[anti-drift-tests-compare-against-the-live-oracle-b4d2]].
- Pick this up with T11 itself; correcting the number in isolation buys one workflow.
