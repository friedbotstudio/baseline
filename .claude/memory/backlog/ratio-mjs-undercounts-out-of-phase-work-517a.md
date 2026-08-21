---
key: ratio-mjs-undercounts-out-of-phase-work-517a
category: backlog
scope: [tdd, simplify, integrate, archive]
status: open
source: user-instruction
raised-on: 2026-08-21
raised-in-context: unsanitised-path-pair
verified-at: a163ec5
last-touched: 2026-08-21
governs: .claude/skills/harness/ratio.mjs, .claude/skills/harness/work-planner.mjs
---

> note the undercount out-of-phase work in backlog; then proceed to next steps of workflow

- **The key understates it.** "Undercounts" was the framing when this was raised. The archive measurement showed the work is MIScounted, not uncounted, which is worse: it lands on the wrong side of the division.
- **The defect.** `ratio.mjs` measures payload as the `out_tokens` delta between the `run-start` baseline row and the last `completed` row for a phase in `PAYLOAD_PHASES`. Everything after that phase is envelope. Work that crosses no phase boundary is therefore attributed to whichever phase stamps next, which is always an envelope phase.
- **Measured** on this run, 2026-08-21. The rendered timing table puts 574,075 output tokens on the `simplify` row, because `simplify` was the next phase to stamp after roughly four hours of substantive work (SEO metadata, brand copy alignment, a GA4 parameter, a five-item site fix batch, a design-ui layout pass) that crossed no phase boundary. Payload stayed pinned at 109,427, the `tdd completed` delta. Envelope absorbed the rest.
- **Consequence.** The ratio read 2.93 `under-floor` both before and after that work, and the number was arithmetically correct throughout. A verdict that says "this change was too small to justify its ceremony" fired on a run carrying 25 modified files, 434 insertions and 3 new files.
- **Open question, unchanged.** Widen the measure so out-of-phase work counts as payload; scope the verdict explicitly to in-phase payload so the number stops implying more than it knows; or leave it and document the limitation. The middle option is the cheapest and the least useful.
