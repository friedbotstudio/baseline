---
key: phase-timer-collapses-phases-appended-in-one-workflow-json-write
category: landmines
scope: [scout, spec, tdd, security, integrate]
verified-at: f36b142
last-touched: 2026-07-19
---

- **Status 2026-07-19 (PARTIALLY RESOLVED, `timing-instrument-repair`)**: the DATA is now honest, the RENDER is not. `stampFromWorkflow` stamps every row emitted by one call with a shared `batch_id` and `batch_size`, so a batched row is distinguishable from a phase that genuinely cost nothing. But `renderTable` does **not** read those fields yet, so `timing.md` still prints `0 / 0` for collapsed rows — observed live in `docs/archive/2026-07-19/timing-instrument-repair/timing.md` (`tdd:verify` and `tdd:finalize`, both members of a `batch_size: 3` group). Until the renderer consumes them ([[render-consume-batch-and-wait-fields-7c31]]), read the JSONL directly rather than trusting the rendered table. The mitigation below (one phase per write) still applies and is still the cleanest fix at the source.
- **Forward-only caveat**: the `run-start` baseline row is written **once per slug**, on the first stamp. The same landing corrected its `ts` to `created_at * 1000`, but the 55 timing files that predate the fix keep their zero-duration phase 1 permanently — they are not retroactively repaired, and any cross-era comparison of phase-1 cost is invalid.

- Path: `.claude/hooks/phase_timer.mjs` + `.claude/hooks/lib/timing.mjs → stampFromWorkflow` (stamps on `workflow.json → completed[]` growth) → rendered into `<bundle>/timing.md`.
- Trap: the stamper treats **each write** to `completed[]` as ONE phase transition. Appending several phases in a single write collapses them: only the last gets a stamp, and the others render as **0 ms**, their real cost absorbed into the neighbouring span. Live 2026-07-12 (`unified-execution-roadmap`, chore track): the run appended `["chore","verify","simplify"]` in one `node -e` write, and `timing.md` rendered `chore 505402ms / verify 0ms / simplify 0ms` — verify and simplify each did real work (a full audit run, a cleanup edit + re-verify) and both read as free.
- Why it bites the chore track hardest: `chore` runs `verify`/`simplify`/`integrate`/`document` as *internal conditional phases*, so it is natural to batch the `completed[]` append at the end of the skill — which is exactly the shape that triggers the collapse. Spec/tdd tracks append one phase per harness loop iteration and mostly dodge it.
- Mitigation: append **one phase per write** to `completed[]`. When a skill finishes several conditional phases, write after each, not once at the end.
- Blast radius: a chore-track `timing.md` is unusable for the cross-track lever ranking — it under-reports whichever phases were batched and over-reports the one they collapsed into. Same failure class as the DATA-POINT-3 gap (silently-wrong sample > missing sample).
- Companion: [[baseline-velocity-levers-after-lever0-timing-v0lv]] (the consumer this poisons). Distinct from [[triage-created-at-written-from-recall-poisons-first-phase-timing]]: that one anchors phase 1 to a fictional origin; this one drops stamps for phases that really ran.

---
