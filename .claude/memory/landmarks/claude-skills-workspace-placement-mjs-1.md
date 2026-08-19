---
key: .claude/skills/workspace/placement.mjs:1
category: landmarks
rests_on: zero-runtime-dependencies
load_bearing: true
scope: []
governs: .claude/skills/workspace/placement.mjs, .claude/skills/code-structure/SKILL.md, docs/annotations.md
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/workspace/placement.mjs`. Domain — the annotation placement policy for tracking comments (spec ACs 010/011).
- Role: `annotationPlacementAllowed(memDir, key)` returns true only when the named decision carries `load_bearing: true`; absent marker and explicit `false` both decline. `proposeLoadBearing({memDir, key, rationale, confirmed})` writes the marker ONLY when `confirmed === true`.
- **The engineer sets the marker; Claude proposes.** Spec decision D5, `owner: engineer`. The marker decides where annotations land in real source, so an unaided wrong call either scatters comments across code nobody will break or withholds them from the one place that matters.
- The guard tests `confirmed !== true`, deliberately not truthiness — a gate that accepts a truthy accident is not a gate.
- `assertSafeFactKey(key)` runs at function entry, before `findEntry` and before any path construction. Security review F-1 (CWE-22): `findEntry` matches on the DECLARED frontmatter `key:`, not the filename, so a shard named `innocent.md` carrying `key: ../../victim/target` steered the write out of the store entirely while reporting `{"written":true}`.
- `stampMarker` rewrites only the frontmatter block via `splitFrontmatter`. An unanchored rewrite would match a BODY line quoting the field while documenting the schema — routine in this corpus.
- Companion: `.claude/skills/workspace/store.mjs:1`, `docs/annotations.md` (the format reference `code-structure/SKILL.md` points at).
