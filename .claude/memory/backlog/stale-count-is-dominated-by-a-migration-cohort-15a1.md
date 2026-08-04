---
key: stale-count-is-dominated-by-a-migration-cohort-15a1
category: backlog
scope: any
status: open
raised-on: 2026-08-05
raised-in-context: ledger-key-form (surfaced during an ad-hoc /memory-flush)
source: assistant-deferral
estimated-effort: low (one cohort decision, not 115 per-entry prompts)
verified-at: d36d7f0
last-touched: 2026-08-05
---

> verbatim (assistant, 2026-08-05):
> "If that misleading number keeps prompting sweeps, the fix is on the migration cohort as a cohort, not per-entry."

- Intent: The session-start stale count reads as rot but is mostly an artifact. Measured 2026-08-05: 194 entries reported stale, of which **115 carry one of four consecutive June dates** (41 on 2026-06-20, 11 on 06-21, 7 on 06-22, 56 on 06-23) — the sharded-store migration (`memory-index/migrate.mjs`) bulk-stamped them, so they were never reviewed rather than reviewed-and-aged. Only 6 entries predated that cohort; sweeping them took one pass and left the count at 189.
- Why it matters: a number that says 189 when the real backlog of unreviewed facts is a handful trains the reader to ignore the signal, and `/memory-flush` Step 0c prompts one entry at a time — answering a bulk question in retail. The stale predicate is not wrong; the cohort's `last-touched` simply records when the migration ran, not when a human last checked the fact.
- Options (not yet decided): re-stamp the cohort in one reviewed batch; or record the migration date separately from `last-touched` so the decay predicate can tell "migrated" from "verified"; or leave the count and teach the session-start reader to report the cohort separately.
- Do NOT "fix" this by widening the stale threshold — that hides every genuinely rotten entry along with the cohort.
- Relates to [[scope-backfill-coarse-refine-per-entry-2902]], which is the other half of the same migration's debt (coarse category-level `scope:` backfill).
