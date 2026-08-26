---
key: a-red-pre-existing-test-may-be-a-contract-conflict
category: conventions
scope: [scenario, implement, integrate]
governs: tests/**
verified-at: 5f52ba2
last-touched: 2026-08-27
---

- Convention: **a pre-existing test that goes red under a new spec is a CONTRACT CONFLICT, not a break, and the two are repaired differently.** Read the old assertion as a statement of the old contract. Keep every clause the new spec does not touch, replace only the superseded one, and name the AC that supersedes it in a comment.

**Measured 2026-08-13.** `assert.deepEqual(second, first)` bundled two contracts into one line: the shard path and the write flag. AC-003 changed only the flag (a byte-identical rewrite now writes nothing), so deleting the assertion to get green would have dropped the path invariant with it. Split into two assertions, one survived unchanged.

The same run found the inverse: a test whose pinned prose carried a REASON that had become false. `test_when_system_readme_scanned_then_materialize_example_and_its_reason_survive` asserts a README says "`materialize` has no subcommand" and "it writes", with a message explaining "this dispatcher exposes reads". The dispatcher exposes four writers today (`delta`, `digest`, `shards`, `restore-shards`) out of 17 subcommands; it was recorded as eight when this was written, and the count is a census, so re-measure it rather than defending it. The guard is still worth keeping — it stops a sweep deleting the only documented way to add an element — so the page was reworded to satisfy all three assertions truthfully and the stale rationale was corrected in the test's comment. No assertion changed.

- **Never delete a red assertion wholesale to get green.** The surviving half is usually the invariant that mattered.
- **A test's message is not its assertion.** Correcting a message that has gone stale changes nothing the test checks and is worth doing in the same pass, or the next reader inherits the false reason.
- Sibling: [[census-and-budget-are-different-numbers]] — the other shape a red literal takes.
