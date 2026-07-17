---
key: phase-timer-collapses-phases-appended-in-one-workflow-json-write
category: landmines
scope: [scout, spec, tdd, security, integrate]
verified-at: 3160e0c
last-touched: 2026-07-12
---

- Path: `.claude/hooks/phase_timer.mjs` + `.claude/hooks/lib/timing.mjs → stampFromWorkflow` (stamps on `workflow.json → completed[]` growth) → rendered into `<bundle>/timing.md`.
- Trap: the stamper treats **each write** to `completed[]` as ONE phase transition. Appending several phases in a single write collapses them: only the last gets a stamp, and the others render as **0 ms**, their real cost absorbed into the neighbouring span. Live 2026-07-12 (`unified-execution-roadmap`, chore track): the run appended `["chore","verify","simplify"]` in one `node -e` write, and `timing.md` rendered `chore 505402ms / verify 0ms / simplify 0ms` — verify and simplify each did real work (a full audit run, a cleanup edit + re-verify) and both read as free.
- Why it bites the chore track hardest: `chore` runs `verify`/`simplify`/`integrate`/`document` as *internal conditional phases*, so it is natural to batch the `completed[]` append at the end of the skill — which is exactly the shape that triggers the collapse. Spec/tdd tracks append one phase per harness loop iteration and mostly dodge it.
- Mitigation: append **one phase per write** to `completed[]`. When a skill finishes several conditional phases, write after each, not once at the end.
- Blast radius: a chore-track `timing.md` is unusable for the cross-track lever ranking — it under-reports whichever phases were batched and over-reports the one they collapsed into. Same failure class as the DATA-POINT-3 gap (silently-wrong sample > missing sample).
- Companion: [[baseline-velocity-levers-after-lever0-timing-v0lv]] (the consumer this poisons). Distinct from [[triage-created-at-written-from-recall-poisons-first-phase-timing]]: that one anchors phase 1 to a fictional origin; this one drops stamps for phases that really ran.

---
