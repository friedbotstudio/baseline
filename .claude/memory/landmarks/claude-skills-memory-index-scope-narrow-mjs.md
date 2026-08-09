---
key: .claude/skills/memory-index/scope-narrow.mjs
category: landmarks
scope: []
governs: .claude/skills/memory-index/*.mjs, .claude/skills/memory-sync/SKILL.md
verified-at: 2bf79ef
last-touched: 2026-08-08
---

- Path: `.claude/skills/memory-index/scope-narrow.mjs`. Proposes a narrowed `scope:` for a memory entry, and applies a confirmed one (roadmap T8).
- Role: `proposeNarrowing(entry)` returns `{key, proposed_scope, proposed_governs, evidence, confidence}` and is PURE — it reads the entry it is handed and touches no store. `applyNarrowing({path, scope, governs})` rewrites frontmatter only, leaving body bytes identical. Two read-only subcommands: `report` prints high-confidence proposals, `check` exits 1 with a named list of unreachable or placeheld entries.
- **Evidence is ranked, and the ranking has a failure mode worth knowing.** `evidenceFor` takes a declared `governs:` first, then a path-shaped `key:`, then a `- Role:`/`- Path:` body anchor. That order is right for curation, but it means the helper treats its own prior output as best evidence — see [[a-repair-pass-that-reads-its-own-output-perpetuates-the-corruption]].
- `withField` replaces the first matching frontmatter line and DROPS later duplicates. Replacing only the first left a stale second line, and `parseFrontmatter` is last-wins, so the stale value silently won.
- Companion: `.claude/skills/memory-index/resolve.mjs:59` owns `isReachable` / `assertWritable` and the `SCOPE_PLACEHOLDER` constant this module imports.
