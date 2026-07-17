---
key: scope-backfill-coarse-refine-per-entry-2902
category: backlog
scope: []
status: open
raised-on: 2026-07-17
raised-in-context: memory-decision-point-redesign
source: assistant-deferral
estimated-effort: medium
verified-at: e8d1480
last-touched: 2026-07-17
---

> verbatim (assistant, 2026-07-17):
> "Coarse scope backfill — legacy entries got category-level scope, so a spec write surfaces ~76 facts as a bounded 15-line index. Per-entry scope precision is future curation."

- Intent: Refine the sharded store's decision-point surfacing from coarse category-level `scope:` backfill to precise per-entry scope tags. The migration (`memory-index/migrate.mjs` `SCOPE_BY_CATEGORY`) tagged every landmine and decision with broad phase scopes, so a Write to `docs/specs/**` matches ~76 facts; `process_lifecycle_guard` bounds the output to a 15-line index (verbatim only for ≤3), which is usable but not targeted. The fix is per-entry curation: as `/memory-flush` promotes or re-verifies facts, narrow each entry's `scope:` to the phases where it is genuinely load-bearing (e.g. the `-7f3a` outcome-AC landmine → `scope: [spec]` only). Relates to the surfacing wiring in [[.claude/skills/harness/pre-implementation-gate.mjs:23]] class of decision-point machinery.
