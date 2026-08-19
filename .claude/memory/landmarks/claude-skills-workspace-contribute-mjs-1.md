---
key: .claude/skills/workspace/contribute.mjs:1
category: landmarks
load_bearing: true
scope: []
governs: .claude/skills/workspace/contribute.mjs, .claude/skills/workspace/conflicts.mjs, .claude/skills/workspace/reconcile.mjs, .claude/skills/workspace/refs.mjs
verified-at: 8201af6
last-touched: 2026-08-14
---

- The four Domain modules of the `workspace` skill, recorded together because each is 20–31 lines and they only make sense as a set. `store.mjs` (Foundation) and `placement.mjs` (policy) have their own entries.
- `contribute.mjs` — `applyContribution({memDir, slug, ops})`. A contribution is a set of typed `add`/`update`/`remove` operations against declared ids (D1), never a whole-file rewrite. Validates `slug` with `assertSafeSlug`. **Rejection is ATOMIC**: any conflict writes nothing at all, so a partially-applied corpus is not a reachable state.
- `conflicts.mjs` — pure `detectConflicts(existing, ops)`. Two kinds: `duplicate-anchor` (two distinct ids claiming one anchor — two contributors describing the same thing under different names) and `unknown-id` (`update`/`remove` naming an absent id). Same id re-declaring its own anchor is idempotent re-application, not a conflict.
- `reconcile.mjs` — `reconcile({memDir, touchedPaths})` returns `{mode, delta}`. An empty or absent corpus degrades to `mode: "discovery"` and never throws. A delta that names every element is a re-derivation wearing a delta's clothes.
- `refs.mjs` — `resolveRefs` (elements reference decisions/constraints BY KEY, never by copy — epic D4) and `resolveAnnotation`. `@research:<path>` is deliberately unsupported: a research doc is a path, not a memory key, so routing it through `resolveCategory` would report every research annotation as dangling.
- **Conflicts are REPORTED, never auto-resolved** (D2). See the `conflicts-are-reported-never-auto-resolved` decision for why.
- **Two defects shipped in `6fc019d` and were fixed 2026-08-04, both found by tests rather than review:**
  - `applyContribution` never called `resolveRefs`, so an element could cite a governing decision that does not exist. The refs check now runs across the WHOLE contribution before anything is written — going per-op would make a partially-seeded corpus reachable and silently lose the atomicity `detectConflicts` guarantees.
  - The `remove` verb was a silent no-op: `applyAll` did `if (op.verb === REMOVABLE) continue;`, so it validated the id existed and then deleted nothing while reporting success. It now calls `removeElement` (Foundation owns the delete). The prior cycle's remove test only exercised the CONFLICT path (absent id), never the success path — which is why a whole verb was inert and green.
- **`detectConflicts` is blind to sibling ops.** It compares each op against the pre-existing corpus only, so same-anchor siblings in ONE contribution apply cleanly and then reject that contribution atomically on re-apply. Known, documented in the `workspace-corpus-seed` spec, deliberately not fixed there — it is why the seed carries 14 uniquely-anchored elements rather than 17.
- `reconcile`'s delta returns `changed` and `unreferenced` only. `added` and `stale` were removed at `/simplify` as stubs — `added` needs a prior snapshot that does not exist, and how an element becomes stale is an open question the spec itself records.
