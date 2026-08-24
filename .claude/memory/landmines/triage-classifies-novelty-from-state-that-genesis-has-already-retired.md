---
key: triage-classifies-novelty-from-state-that-genesis-has-already-retired
category: landmines
scope: [intake, spec]
governs: .claude/skills/triage/SKILL.md, .claude/skills/standup/SKILL.md, .claude/state/epic
load_bearing: true
source: incident
verified-at: 05d8fec
last-touched: 2026-08-24
---

- **Trap: `/triage` Step 0 cites runtime state as `novelty_evidence`, and runtime state is the LOWEST rung of Art. I.4 precedence.** `spec-derived` feels well-evidenced precisely when the citation is concrete — an epic slice, a `children[]` row, a roadmap line. All three are implementation records. `seed.md` outranks every one of them and is the document most likely to have retired the work.
- **Observed 2026-08-17, `mvp-sprint-closeout`.** Triage routed Epic 11 slices D+E to the `power` track, classified `spec-derived`, evidence cited as `children[] status:open` in `.claude/state/epic/mvp-sprint-parallel-cycles.json` plus the roadmap rows. Every cited fact was TRUE. The conclusion was still wrong: `docs/init/seed.md:217` states Article X "graduat[es] and supersed[es] the retired `sprint-dispatch` prototype **and the `mvp-sprint-parallel-cycles` Slice E reserved-charter slot**". Slice E was closed by genesis and the epic state had never been updated. The workflow was armed, entered `/spec`, and halted two minutes in on supersession drift — `.claude/state/harness/mvp-sprint-closeout.log` records `yielded: spec halted on supersession drift`. Whole triage discarded.
- **It fired twice in one session, on two different surfaces.** `/standup`'s "recommended next pickup" reached the same wrong answer minutes earlier from the same records, recommending Epic 11 D+E as the smallest unblocker. Neither surface reads `seed.md`. A lazily-maintained record plus a plan file agreeing with each other is not corroboration — they are the same rung twice.
- **Cheap check that would have caught it:** before classifying `spec-derived` against an epic slice, `grep` the epic slug in `docs/init/seed.md`. One command, and it is the only rung above the state file.
- **Second face: a triage hypothesis is not evidence.** The same session's `/triage` for `fix-failing-tests-at-head` asserted in its phase brief that "two new landmines governing `scoped-memory.mjs` landed in `c92f82a`, which should move that count by +2, not +1". Both landmines actually predate the baseline (`98c3ae4`, `59275de`, 2026-08-04) and were already counted; the real cause was ONE entry filed by `309d70e` itself. Cost was contained only because the brief said INVESTIGATE BEFORE CHANGING THE NUMBER — a hypothesis written in the imperative voice of a finding is what a downstream phase acts on. Mark inference as inference in the brief, or verify it before writing it.
- **Why the epic state drifts in the first place.** `children[]` registers lazily and is corrected by hand — this epic's own `recovery_note` records a 2026-06-23 incident where `epic_close.mjs` closed it on slice A because it checked `children[]` rather than `slices[]`. A record that needs hand-repair after every mis-close is not a record to classify from.
- Related: [[epic-11-slice-e-superseded-by-article-x]] (the supersession), [[roadmap-epic-11-row-d-overstates-progress]] (the roadmap half of the same wrong picture), [[read-implementation-and-seed-before-reporting-a-hook-defect]] — that entry is about DIAGNOSIS order and says so in its caveat; this one is about AUTHORITY order at classification time.
