---
key: memory-system-redesign-landmines-captured-but-not-honoured-at-decision-point-7f3a
category: backlog
scope: []
status: picked-up
raised-on: 2026-07-10
raised-in-context: harden-power-track-debt (post-cycle retrospective)
source: user-instruction
estimated-effort: large (memory-system redesign; needs its own intake→spec→approve cycle — do NOT quickfix)
verified-at: 0ed9deb
last-touched: 2026-07-10
superseded-at: 2026-07-17
---

> verbatim (user, 2026-07-10):
> "the pattern keeps repeating you said; proof that landmines exist but possibly not honoured; we may have to rethink our memory system; mark it in backlog; we will redesign the memory system"

- Intent: redesign the memory system so a captured lesson becomes an ACTIVE constraint at the moment of the relevant decision, not a passive archive that only helps if a phase happens to read it.
- Problem (the proof): the drift_check process/outcome-AC landmine was written at the end of `power-track-completion` (as AC-007) AND explicitly reinforced during `harden-power-track-debt`'s memory-flush — yet the SAME anti-pattern (outcome-ACs with no diff line, wedging drift_check) recurred WITHIN this workflow as AC-011/AC-012, caught only when drift_check wedged again. The lesson was captured, acknowledged, and re-recorded, and still did not prevent the next occurrence one workflow later. Two structural failures underneath: (1) **passive archive, not active guard** — a landmine in `landmines.md` only fires if the relevant phase reads it at the relevant moment (scout reads landmarks; NOTHING surfaced the outcome-AC landmine at spec-authoring time, which is exactly where it would have prevented the mistake); (2) **no escalation of recurrence** — the enforcement funnel already exists (`landmine → advisory hook → hard gate`, the `retrospective`/`checker-graduation` machinery) but a landmine that recurred in CONSECUTIVE workflows never graduated. A recurring landmine is by definition a graduation candidate the system failed to escalate.
- Design directions (resolve before implementing; do NOT overbuild — this is a redesign brief, not a spec): (a) **decision-point injection** — phase skills proactively query landmines scoped to their phase (spec-authoring loads spec-authoring landmines) and surface the verbatim before the relevant write, the way `process_lifecycle_guard` already does for Bash; (b) **recurrence-driven auto-graduation** — track a hit-count per landmine; a landmine that fires N times across distinct workflows auto-promotes to a mechanical advisory/hard check (e.g. a spec-lint rule that flags an outcome-AC in the AC table, which would have caught AC-007/011/012 mechanically instead of via drift_check wedge); (c) **the specific mechanical check this case wants** — an AC-table linter that classifies each AC as behavioural (has a resolvable diff surface) vs process/outcome (no diff line) and warns at spec time, so drift_check never wedges on an outcome-AC again. Relates to the v1 oracle-bound-checker epic [[baseline-v1-thought-compiler-agent-team-plan-mode-9d4c]] (the graduation funnel is the same north star) and [[promote-review-skills-to-oracle-bound-checkers-d186]].

---
