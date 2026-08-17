---
key: roadmap-epic-11-row-d-overstates-progress
category: backlog
scope: []
governs: .claude/skills/roadmap-sync/backfill.mjs
status: open
source: inferred-from-code
deferred: cost
raised-on: 2026-08-17
raised-in-context: epic11-slice-e-superseded
verified-at: 309d70e
last-touched: 2026-08-17
---

- **The drift.** `docs/roadmap-execution-plan.md:174` reads `- 🟡 D. Merge + integrate + single gate-C on the sprint result` — in-progress. `.claude/state/epic/mvp-sprint-parallel-cycles.json` records that child as `{slice: "D", slug: null, status: "open"}`: no child workflow was ever started, and no code exists. The row should read ⬜.
- **Where the 🟡 came from.** The Epics 8-12 backfill (`19631b7`) mapped slices to emoji from the epic's `children[]`, and `backfill.mjs` derives "any registered status other than `committed` → 🟡". Slices B–E were pre-registered as open children during the 2026-06-23 epic-close recovery, so an *unstarted* slice and an *in-flight* one both render 🟡.
- **Why it matters beyond cosmetics.** `standup` reads these rows to report what is in flight. Epic 11 currently shows two in-progress slices when the true count is zero, which is what made a power batch look like the obvious next pickup. A roadmap that overstates progress mis-routes triage.
- **Shape of the fix.** Distinguish "registered but unstarted" (`slug: null`) from "in flight" (`slug` set, status open) in `backfill.mjs`'s emoji derivation: `slug: null` → ⬜, registered with a slug → 🟡, `committed` → ✅. Then re-run the idempotent backfill, which will need to update rather than skip already-appended epics — currently the `(tag)` dedupe key makes a second run a no-op, so the correction needs a deliberate path.
- Reason `cost`: touching the backfill emoji derivation plus its idempotence contract is a behaviour change needing tests, not a roadmap hand-edit. Do not fix this by editing the roadmap directly — `roadmap-sync` is deterministic by design and a hand-flip would be exactly the inference-from-diff the skill forbids.
