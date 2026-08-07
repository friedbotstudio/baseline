---
key: delta-remove-verb-is-verified-but-never-applied-7c02
category: backlog
scope: [archive, spec]
status: open
raised-on: 2026-08-07
raised-in-context: system-spec-delta-slice-c
source: assistant-deferral
estimated-effort: small (one branch in applyDelta + two scenarios), blocked on a decision
verified-at: db121a1
last-touched: 2026-08-07
---

> `remove` parses and lints but is verified-not-applied by this slice. Nothing in this cycle defines what removal means for a concept's authored anchors or the orphaned shard, and applying it blind deletes a record on the strength of a table row.

**The state.** `delta.parseDelta` accepts `add | change | remove` — the corpus's existing op vocabulary. `verifyDelta`'s `GROWTH_VERBS` set is `{add, change}`, so a `remove` row is never confirmed and always lands in `drift`. `spec-lint` (slice A) validates that a `remove` row's element id resolves, so a spec can author one, pass gate A, and have `/archive` report it as drift forever.

**Why it was left.** Removal has three unanswered sub-questions this slice had no AC for: does the element's `anchors:` row come out of the concept, does its `.puml` shard get deleted or become an orphan, and what confirms a removal in the landed diff (the file being *absent* is the natural signal, which inverts the presence check every other verb uses). Guessing any of them writes a deletion nobody approved.

**Not a silent gap.** A `remove` row shows up in `drift` on every landing until this is settled, which is the visible-and-unapplied state [[conflicts-are-reported-never-auto-resolved-2026-08-04]] prescribes. The cost is that `drift` then carries two meanings — "the diff disagrees with you" and "this verb is not wired" — and an operator cannot tell them apart from the report alone.

**When to pick this up.** The first spec that actually needs to retire an element. Until then there is no removal to model and building one is speculation.

**Related.** [[drift-check-does-not-resolve-epic-child-pinned-specs]] — the other reason a delta row may never be acted on, for a completely different reason.
