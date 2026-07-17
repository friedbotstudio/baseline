---
key: triage-hand-written-created_at-epoch-corrupts-phase1-timing
category: landmines
scope: [scout, spec, tdd, security, integrate]
verified-at: b6fba83
last-touched: 2026-07-12
caveat: the same run reproduced the OTHER known measurement gap — inter-turn/`AskUserQuestion` idle is invisible to the timing model (only consent-gate tokens count as `human-wait`), so wall-clock time the human spent away silently inflates whichever phase is open. Here `document` rendered 3,502,729 ms (58 min) of "model time" that was mostly the user being away. Any phase showing an implausibly large Model(ms) with Human-wait 0 should be treated as unusable, not as a lever target.
---

- Path: `.claude/skills/triage/SKILL.md` Step 4 (writes `workflow.json → created_at`/`updated_at` as epoch seconds) → consumed by `.claude/hooks/lib/timing.mjs` as the **run-start baseline anchor** for the FIRST phase.
- Trap: `/triage`'s SOP has Claude write `created_at` **by hand**, and Claude has no reliable clock — it reconstructs the epoch from recall. Recall is systematically wrong. Live 2026-07-12 (`auto-merge-classify-base-sha`): Claude wrote `1752316800`, which is **2025**-07-12 — off by exactly one year. `timing.mjs` anchors phase 1 on `created_at`, so the `tdd` rollup rendered as **31,539,049,455 ms (365.03 days)** and `tdd:scenario` as the same. Arithmetic confirms the mechanism exactly: `run-start_ts(1783855613385) − created_at×1000(1752316800000) = 31538813385` == the bogus `tdd:scenario` figure.
- Blast radius (why this matters more than it looks): ONLY the first phase is corrupted — every later phase is a delta between consecutive `phase_timer` stamps and stays correct. So the table looks *mostly* plausible and the bad row is easy to skim past. That is exactly how a poisoned sample enters the cross-track velocity ranking that [[baseline-velocity-levers-after-lever0-timing-v0lv]] is accumulating. A silently-wrong DATA POINT is worse than a missing one.
- Mitigation: NEVER write `created_at`/`updated_at` from recall. Derive them mechanically — `date +%s` in the same Bash call that writes `workflow.json`. If a rendered `timing.md` shows a phase in the hours/days range on a run that took minutes, suspect this first: re-read `workflow.json → created_at`, correct it, and re-run `node .claude/hooks/lib/timing.mjs render <slug>` (the render is idempotent and safe to repeat).
- Companion: [[baseline-velocity-levers-after-lever0-timing-v0lv]] (the consumer this poisons). Related but distinct from the DATA-POINT-3 gap in that entry (Bash-vs-Write hook matcher losing stamps entirely) — this one *produces* stamps, they are just anchored to a fictional origin.

---
