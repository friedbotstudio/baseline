---
key: census-and-budget-are-different-numbers
category: conventions
scope: [scenario, implement, simplify]
governs: tests/**
verified-at: 79e41cb
last-touched: 2026-08-13
---

- Convention: **when a numeric literal in a test goes red, first decide whether it is a CENSUS or a BUDGET.** They look identical and are repaired oppositely.

A **census** counts something that exists (entries matching a scope, elements in a corpus). It has an oracle: re-measure it, name the commit that moved it, move on. Defending it is wrong — the number is supposed to change.

A **budget** caps something (how much memory surfaces at a phase, how large a governance file may grow). It has NO oracle; it is policy. Re-measuring a budget to the exact current value silently converts it into a zero-headroom tripwire that the next legitimate addition breaks, which trains people to bump it without reading it.

**Measured 2026-08-13.** Both fired in one run. The landmark census moved 87 → 88 because a commit added a `[scout]`-scoped landmark; re-measured. The spec phase budget was exceeded at 67 against a cap of 65 because three correctly-scoped entries landed; the cap moved, with a comment recording that backlog entries default to `scope: [spec]` and workflows file backlog entries routinely, so this one drifts on a schedule.

- **Before replacing a literal with a relational assertion, check the relation actually holds.** It often does not. The 120 landmark shards carry seven distinct `scope:` values — 88 `[scout]`, 25 `[]`, and seven others of which three omit scout entirely — so neither "all are `[scout]`" nor "all scoped ones include scout" is true. A wrong relation is worse than an honest literal.
- **When the literal has to stay, keep the number out of the test NAME.** `..._then_the_deferred_set_is_unchanged` survives a bump; `..._then_eighty_seven_remain` forces a rename every time, which is how a rename gets skipped and the name starts lying.
- **A budget re-measured with no headroom deserves a note saying so**, plus the structural driver if there is one. Otherwise the next reader reads a cap and sees a tripwire.
- Sibling: [[a-red-pre-existing-test-may-be-a-contract-conflict]] and [[anti-drift-tests-compare-against-the-live-oracle-b4d2]].
