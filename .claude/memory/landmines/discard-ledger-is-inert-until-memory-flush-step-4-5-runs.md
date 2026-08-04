---
key: discard-ledger-is-inert-until-memory-flush-step-4-5-runs
category: landmines
scope: any
governs: .claude/skills/memory-flush/**,.claude/hooks/lib/memory_stop.mjs
load_bearing: true
verified-at: 39464a1
last-touched: 2026-08-04
---

- **The trap.** Shipping `ledger.mjs` does not make AC-006 true. `memory_stop` folds `decidedKeys()` into its dedup set correctly, and the module's own tests pass, but `.claude/memory/_discard-ledger.md` is only ever created by `/memory-flush` **Step 4.5** calling `recordCuration` per candidate. Skip that step and the ledger stays absent, `readLedger` correctly degrades to "no prior decision" (AC-012), and every candidate just curated is re-offered as fresh.
- **Observed twice on 2026-08-04.** First run: fifteen candidates curated, eleven discarded, all fifteen back within the hour. Step 4.5 was then written into the SOP as the fix — and the very next `/memory-flush` still opened with the same fifteen candidates and no ledger file on disk, because the *first* run predated the step. The consumer-side wiring being correct is what makes this hard to see: nothing is broken, nothing errors, the reading half just has nothing to read.
- **How to avoid it.** Record **before** the Step 5 reset, never after, and record **both** dispositions — a discarded candidate that is not recorded returns exactly like an unrecorded promotion. Verify with `ls .claude/memory/_discard-ledger.md` after a flush; an absent file means Step 4.5 did not run, regardless of what the report said.
- **General shape.** A producer/consumer pair where only the consumer is code and the producer is a SOP instruction fails silently and asymmetrically. Same class as `document-gate.mjs` shipping without `receipts.mjs`, and same class again as nothing forcing `/document` to *call* its gate. Prose in a SKILL.md cannot fail a build.
- Companion: `.claude/skills/memory-flush/ledger.mjs:54`, `.claude/memory/landmarks/claude-skills-document-document-gate-mjs-1.md`.
