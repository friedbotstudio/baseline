---
key: work-planner-envelope-ratio-3x-soft-4x-optimal
category: decisions
scope: [intake, spec]
governs: .claude/skills/harness/rightsize-gate.mjs, .claude/hooks/lib/timing.mjs
source: user-instruction
owner: engineer
verified-at: b93a5e4
last-touched: 2026-08-20
---

> this is good, if historic data is 1.6x and I'm not happy with is, then 3x as soft
> and 4x as optimal is my take. I don't care for historical work flagging. That is
> history and to be learned from

- The work-planner enforces **payload / envelope >= 3x as a soft floor and 4x as the
  target**. Below 3x the planner recommends adding work BEFORE the tail runs; between
  3x and 4x it proceeds silently; at or above 4x it reports the batch as well-sized.
  In spend terms: envelope is 25% of the workflow at the floor, 20% at target.
- **Historical distribution did not set the number and was not allowed to.** Measured
  2026-08-20 over 69 archived bundles with both sides instrumented: median 1.60x,
  p75 3.53x, p90 5.36x. The engineer's call is that history is the baseline to beat,
  not the target to conform to, so the "this would flag 83% of past runs" objection
  was explicitly overruled and is not a reason to revisit.
- Two thresholds, not one, so the system has something to aim at rather than only a
  tripwire to clear.
- **Blocked on instrumentation, and this is correctness, not calibration.** 45 of 117
  archived bundles stamp no payload phase at all, and zero bundles have ever recorded
  the `attempts` re-entry counter. A ratio computed from an unstamped payload is a
  confident number over a missing half. Both holes close before the check goes live.
- **Open, and it decides what the ratio means:** which phases are envelope and which
  are payload. security and integrate are envelope; simplify is arguable, being rework
  on the payload rather than ceremony. The split belongs in the spec as a stated
  decision, never as a constant inside a helper.
