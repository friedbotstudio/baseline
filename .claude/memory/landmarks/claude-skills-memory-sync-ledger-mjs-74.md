---
key: .claude/skills/memory-sync/ledger.mjs:74
category: landmarks
scope: []
governs: .claude/skills/memory-sync/**, .claude/hooks/lib/memory_stop.mjs
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/memory-sync/ledger.mjs`, writing `.claude/memory/_discard-ledger.md`. The discard ledger (spec ticket D).
- Role: exports `CANDIDATE_SEPARATOR`, `candidateKey`, `isCandidateKey`, `ledgerPath`, `readLedger`, `recordCuration({key, disposition})` and `decidedKeys()`. `memory_stop` folds `decidedKeys()` into its dedup set so a candidate curated once is never re-offered as fresh (AC-006).
- **The key shape is defined here once and imported, never re-spelled.** `candidateKey(left, right)` builds every key `memory_stop` emits (all three construction sites) and `isCandidateKey` guards every key `recordCuration` accepts, so the builder and the validator cannot drift. Before d36d7f0 each side carried its own literal and a wrongly-shaped key was stored happily and matched nothing — see [[ledger-row-can-exist-and-still-suppress-nothing]].
- The capture leg was never un-deduped — it deduped against the wrong **lifetime**. `memory_stop` builds `existingKeys` from the *current* `_pending.md` body; `/memory-sync` then resets that body and discards the dedup state along with the candidates it curated. The job here is to persist a curation decision **across** that reset, not to add a second dedup — adding one would duplicate working code and risk regressing `tests/memory-stop-dedup.test.mjs`.
- The ledger lives **outside** the flush reset path, for the same reason `_thread.md` does: durable local state, gitignored in content, whose whole value is surviving the operation that clears everything around it.
- **The module is inert unless `/memory-sync` Step 4.5 calls `recordCuration` for every candidate, promoted and discarded alike.** Observed 2026-08-04: fifteen candidates curated, eleven discarded, all fifteen back within the hour, because the ledger file was never created. See the `discard-ledger-is-inert-until-memory-sync-step-4-5-runs` landmine.
- Absent, unreadable or malformed ledger all read as "no prior decision" (AC-012) — a candidate re-surfaces rather than vanishing, which is the safe direction. `readLedger` is deliberately unguarded and still parses pre-d36d7f0 bare-key rows; those rows are inert by construction (nothing `memory_stop` builds can equal them), so hardening the read path would invalidate history without closing any path.
- `recordCuration` rejects `/[\r\n]/` in `key` FIRST, before the key-form guard: the ledger is line-delimited, so a key carrying a newline writes a forged second row, and since `decidedKeys()` feeds the suppression set, a forged key permanently silences an unrelated future candidate (security review F-3). The two guards are ordered deliberately — a newline key is refused silently by F-3 and never reaches the key-form guard's stderr warning, which would otherwise mislabel a forged-row attempt as a shape mistake.

- load_bearing: true
