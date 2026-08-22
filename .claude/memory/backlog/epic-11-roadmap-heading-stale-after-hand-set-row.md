---
key: epic-11-roadmap-heading-stale-after-hand-set-row
category: backlog
scope: []
status: open
raised-on: 2026-08-22
raised-in-context: baseline-mcp
source: assistant-deferral
estimated-effort: small
verified-at: 3eafe4f
last-touched: 2026-08-22
governs: docs/roadmap-execution-plan.md
---


- Intent: Epic 11's heading reads 🟡 while all five of its rows read ✅. `syncRoadmap` recomputes a heading only for an epic whose rows it flipped in that run, and Epic 11's row D was hand-set to superseded during Epic 13 slice E without a recompute. Fix through the sanctioned writer rather than by hand: run the sync with the `E11-D` token, which recomputes the heading and changes no row, since row D is already done.
