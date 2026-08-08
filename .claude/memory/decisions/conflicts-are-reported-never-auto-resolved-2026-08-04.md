---
key: conflicts-are-reported-never-auto-resolved-2026-08-04
category: decisions
scope: []
governs: .claude/skills/workspace/**, .claude/memory/workspace/**
load_bearing: true
verified-at: 39464a1
last-touched: 2026-08-04
---

- Decision: in the workspace structural corpus, element identity is a **declared `id:`**, a contribution is a set of typed `add`/`update`/`remove` operations against ids, and **conflicts are reported, never auto-resolved**. Spec decisions D1 and D2 of `living-system-model-ef`.
- Why identity is the id: it makes `workspace extends` mechanical rather than textual. Two disjoint contributions touch disjoint ids and both survive with no merge logic at all, so the common case costs nothing.
- Why reporting rather than resolving: auto-merging two contributors' structural intent is precisely the semantic conflict textual git merge already commits happily. Doing it silently in our own format would not be an improvement. Reporting matches the store's existing register — `assertSafeFactKey`, `assertSafeSlug`, and `writeConstraint`'s `UnregisteredCategoryError` all reject rather than normalize.
- Rejection is **atomic**: a contribution carrying any conflict writes nothing, so "the corpus reflects some contributor's whole intent" stays true at every instant.
- Two conflict kinds only: `duplicate-anchor` (distinct ids claiming one anchor) and `unknown-id` (`update`/`remove` against an absent id).
- Rejected alternative: last-write-wins, which loses a contributor's intent the same way textual merge does; and full three-way merge, which is real work with no demand behind it — there is not yet a single recorded instance of concurrent corpus contribution. Build detection now, resolution when a third concrete case forces it.
