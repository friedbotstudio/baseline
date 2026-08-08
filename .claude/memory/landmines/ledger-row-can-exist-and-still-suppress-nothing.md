---
key: ledger-row-can-exist-and-still-suppress-nothing
category: landmines
scope: []
governs: .claude/skills/memory-flush/ledger.mjs, .claude/hooks/lib/memory_stop.mjs
verified-at: d36d7f0
last-touched: 2026-08-05
---

- **The trap.** `/memory-flush` Step 4.5 can run, write rows, and still suppress nothing. `memory_stop` builds its dedup set from the FULL `## CANDIDATE:` header text (`memory_stop.mjs:275`) and folds `decidedKeys()` into that same set by exact string; `recordCuration` stores whatever key it is handed, verbatim. Record a bare key (`annotations.mjs` instead of `annotations.mjs → landmarks.md`) and the row lands, matches nothing, and every candidate you just curated comes back next turn.
- **Observed 2026-08-05.** Step 4.5's example read `key:'<candidate key>'`, which reads naturally as the bare key. Two candidates were curated, both recorded in the wrong shape, and neither would have been suppressed. Caught only by noticing that every prior row in the file carried a ` → ` separator and these two did not.
- **This defeats the sibling landmine's own check.** [[discard-ledger-is-inert-until-memory-flush-step-4-5-runs]] says to verify with `ls .claude/memory/_discard-ledger.md`, because an absent file means the step never ran. Here the file IS created. Presence proves the step ran; it does not prove the rows match anything. Verify the SHAPE of the rows, or re-run capture and confirm the candidate does not return.
- **How to avoid it.** Copy the header line verbatim, separator and target included. Since d36d7f0 `recordCuration` refuses a non-header key — returns `false` and names the expected shape on stderr — so check the return value; `false` means nothing was recorded. It refuses rather than repairs because nothing can infer which target a bare key belonged to, and a silently rewritten key would hide the mistake at the moment it was still fixable.
- **General shape.** When one module BUILDS an identifier and another VALIDATES or matches it, a second definition of the shape is a silent-failure generator: both halves look correct in isolation and the bug only appears as absence. The fix is one exported constructor (`candidateKey`) plus one predicate (`isCandidateKey`) that both sides import, never two literals that agree today. Same class as a serializer and parser that each hard-code a format.
- Companions: `.claude/skills/memory-flush/ledger.mjs:74`, `tests/ledger-key-form.test.mjs` (the coupling test `test_when_memory_stop_builds_keys_then_every_key_satisfies_is_candidate_key` is what fails if the two definitions ever drift apart).
