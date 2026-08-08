---
key: .claude/skills/memory-index/constraints.mjs:41
category: landmarks
scope: []
governs: .claude/memory/constraints/**, .claude/skills/memory-index/constraints.mjs, .claude/skills/memory-flush/**
load_bearing: true
verified-at: 39464a1
last-touched: 2026-08-04
---

- Path: `.claude/skills/memory-index/constraints.mjs`. The constraint node and the invalidation edge that earns it a category of its own (spec ticket B, epic decision D2).
- Role: exports `writeConstraint(memDir, key, fields)` (the **only** sanctioned way to create a constraint — `/memory-flush` Step 4.5 calls it rather than writing the file directly), `decisionsRestingOn(memDir, constraintKey)`, and `UnregisteredCategoryError`.
- Why an eighth category rather than a field on decisions: a decision is **immutable** and expires by supersession; a constraint is **mutable** — its `state` flips when the world changes and `state_verified_at` records when that was last checked. A constraint shared by five decisions would otherwise be written five times, and a flip would have no single home to record it in.
- The edge that pays for the category is **invalidation**: when a constraint flips, every decision whose rationale `rests_on:` it becomes suspect at session start. Without a first-class node there is nowhere for that walk to start.
- `writeConstraint` refuses to write when `constraints` is absent from `CANONICAL` (AC-010, rollout prerequisite P1). Rejected, never repaired — a constraint written into an unregistered directory is present on disk, invisible to the index, and silently absent from every lookup. Key safety reuses `assertSafeFactKey` from `migrate.mjs` rather than adding a second validator (security review F-5, same class as the ledger's F-3).
- `decisionsRestingOn` goes through `resolveCategory`, so it answers correctly on a flat (unmigrated) store too.
- Companion: `.claude/skills/memory-index/categories.mjs:1` (registers the category), `.claude/hooks/lib/memory_session_start.mjs:1` (surfaces the flip).
