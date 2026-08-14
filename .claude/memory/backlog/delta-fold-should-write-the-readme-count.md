---
key: delta-fold-should-write-the-readme-count
category: backlog
scope: []
status: picked-up
source: assistant-deferral
raised-on: 2026-08-08
raised-in-context: skill-helper-cli-dispatchers
verified-at: 4cc46e0
last-touched: 2026-08-08
governs: .claude/skills/workspace/delta.mjs,.claude/skills/workspace/readme-gate.mjs,docs/system/README.md
superseded-at: 2026-08-14
---

> Have `verifyAndApplyDelta` update the Count column in `docs/system/README.md` as part of applying a confirmed `add` row, so the corpus census and the README cannot diverge.

- **The work.** `verifyAndApplyDelta` writes the element record and its shard for a confirmed `add` row and leaves the README Count column untouched. `readme-gate.checkReadmeCounts` enforces that column, so the fold makes its own README false in the same call.
- **Why it is worth fixing rather than remembering.** It fires on EVERY workflow whose spec declares a confirmed `add` row, at `/archive`, after the suite was already green. Measured 2026-08-08 on `skill-helper-cli-dispatchers`: one row took the corpus to 115 elements / 115 diagrams against a README claiming 114 / 114 and failed three tests.
- **Shape of the fix.** The count is derivable from the same directory read the fold already performs; writing it is the same write. Do NOT relax `readme-gate` instead — the gate is what makes the census a fact rather than a claim.
- **The trap this closes.** [[delta-fold-writes-elements-but-not-the-readme-count]] records the symptom for whoever hits it before this lands; this entry is the fix.
- **Pairs with.** [[replace-the-corpus-census-literals-with-a-relational-assertion]] — the same census duplicated a second time, in a test.
