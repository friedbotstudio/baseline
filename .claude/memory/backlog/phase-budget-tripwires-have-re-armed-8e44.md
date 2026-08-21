---
key: phase-budget-tripwires-have-re-armed-8e44
category: backlog
scope: [integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-21
raised-in-context: unsanitised-path-pair
verified-at: a163ec5
last-touched: 2026-08-21
governs: tests/memory-scope-store-invariants.test.mjs
deferred: human-directed
---

> A budget is raised deliberately, with stated headroom, by a human. So this is a proposal, not a patch.

- **Measured 2026-08-21**, after the `unsanitised-path-pair` flush: `spec` 88 / 88 (headroom 0), `security` 29 / 30 (headroom 1), `research` 16 / 20 (headroom 4).
- **The `spec` cap has re-armed.** The comment above `PHASE_BUDGETS` records that every prior bump set the cap to the measured value, that each produced a zero-headroom tripwire the next flush tripped, and that this happened five times in one session. The repair set `spec` to 73 plus roughly 20%, "about fifteen entries before anyone has to look at this line again". Those fifteen are spent. The next entry scoped to `spec` turns the suite red in a workflow that has nothing to do with it, which is the exact failure the repair was written against.
- **`security` is one entry from the same state.** It carries no headroom rationale in the comment at all, which suggests it was set to a measured value and never revisited.
- **This flush already paid it.** Two new entries scoped to `security` took it to 31 and failed the suite. The scoping was genuinely too wide and was narrowed on the merits, so the cap did its job here. That does not make the headroom adequate; it means the next flush is one honest entry away from a red suite.
- **Not fixed here, deliberately.** `/memory-sync` Step 4.7 states that a census is re-measured and a budget is raised deliberately with stated headroom by a human. Re-measuring `spec` to 88 would be the seventh instance of the mistake the comment documents.
- **The open question is still open**, and it is the better fix: the comment records that what the cap SHOULD measure is surfaced volume rather than entry count, "since a count says nothing about the context cost the budget exists to bound".
