---
key: replace-the-corpus-census-literals-with-a-relational-assertion
category: backlog
scope: []
status: picked-up
source: assistant-deferral
raised-on: 2026-08-08
raised-in-context: skill-helper-cli-dispatchers
verified-at: 4cc46e0
last-touched: 2026-08-08
governs: tests/system-spec-relocation.test.mjs,.claude/skills/workspace/readme-gate.mjs
superseded-at: 2026-08-14
---

> `tests/system-spec-relocation.test.mjs` hardcodes the corpus census in three places. That duplicates `readme-gate`'s job without its sync mechanism, so it must be hand-bumped on every legitimate corpus growth.

- **The work.** Three literals — `assert.equal(elements, 115, ...)`, the matching `diagrams` line, and an `elements.length` check on `readAll` — pin an absolute count that changes whenever the corpus grows. They were bumped 114 → 115 during `skill-helper-cli-dispatchers` for no reason other than that one element was added.
- **Why the literals are the wrong oracle.** The suite name is `A2 — the corpus is relocated to docs/system/`. Its invariant is that the corpus lives at the new root and every element keeps exactly one shard, and its own `assert.equal(elements, diagrams)` line already carries that. The absolute number tests nothing the relocation cares about.
- **Shape of the fix.** Keep the relational assertion, drop the three literals. `readme-gate` already owns the census and has a mechanism to keep it true; a second copy with no mechanism is a recurring hand-edit.
- **Pairs with.** [[delta-fold-should-write-the-readme-count]] — same census, the other copy, and the reason both keep needing a manual bump.
