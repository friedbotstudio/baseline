---
key: .claude/skills/memory-flush/ledger.mjs:54
category: landmarks
scope: any
governs: .claude/skills/memory-flush/**,.claude/hooks/lib/memory_stop.mjs
load_bearing: true
verified-at: 39464a1
last-touched: 2026-08-04
---

- Path: `.claude/skills/memory-flush/ledger.mjs`, writing `.claude/memory/_discard-ledger.md`. The discard ledger (spec ticket D).
- Role: exports `ledgerPath`, `readLedger`, `recordCuration({key, disposition})` and `decidedKeys()`. `memory_stop` folds `decidedKeys()` into its dedup set so a candidate curated once is never re-offered as fresh (AC-006).
- The capture leg was never un-deduped — it deduped against the wrong **lifetime**. `memory_stop` builds `existingKeys` from the *current* `_pending.md` body; `/memory-flush` then resets that body and discards the dedup state along with the candidates it curated. The job here is to persist a curation decision **across** that reset, not to add a second dedup — adding one would duplicate working code and risk regressing `tests/memory-stop-dedup.test.mjs`.
- The ledger lives **outside** the flush reset path, for the same reason `_thread.md` does: durable local state, gitignored in content, whose whole value is surviving the operation that clears everything around it.
- **The module is inert unless `/memory-flush` Step 4.5 calls `recordCuration` for every candidate, promoted and discarded alike.** Observed 2026-08-04: fifteen candidates curated, eleven discarded, all fifteen back within the hour, because the ledger file was never created. See the `discard-ledger-is-inert-until-memory-flush-step-4-5-runs` landmine.
- Absent, unreadable or malformed ledger all read as "no prior decision" (AC-012) — a candidate re-surfaces rather than vanishing, which is the safe direction.
- `recordCuration` rejects `/[\r\n]/` in `key`: the ledger is line-delimited, so a key carrying a newline writes a forged second row, and since `decidedKeys()` feeds the suppression set, a forged key permanently silences an unrelated future candidate (security review F-3).
