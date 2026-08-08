---
key: .claude/skills/workspace/store.mjs:1
category: landmarks
scope: []
governs: .claude/skills/workspace/**, .claude/memory/workspace/**
load_bearing: true
verified-at: 39464a1
last-touched: 2026-08-04
---

- Path: `.claude/skills/workspace/store.mjs`. Foundation — the only module in the `workspace` skill that touches the filesystem or parses frontmatter. Everything else composes it.
- Role: `ensureWorkspace` (preflight only — deliberately does NOT create; an absent workspace is reported, never a directory conjured mid-contribution), `readAll` → `{elements, views}`, `writeElement`, and `splitFrontmatter` (also consumed by `placement.mjs`).
- **The corpus lives under `.claude/memory/` but is NOT a ninth canonical category.** `CANONICAL` stays at 8, so no reader that walks canonical categories sees these files, and `everyShardFile()` must never walk `workspace/`. A regression test in `tests/workspace-store.test.mjs` asserts both.
- `writeElement` validates the element id with `assertSafeFactKey` BEFORE building any path, and every other field name and value through `assertSafeFieldValue` — added after security review F-2, where a `title` carrying newlines forged real `load_bearing: true` and `governs:` frontmatter fields.
- `readCollection` isolates per-ENTRY, not per-directory: a malformed element file is skipped while its siblings still read. A per-directory `try` would silently blank the whole corpus (the shape of security F-1 last cycle).
- Companion: `.claude/skills/workspace/contribute.mjs:1` (its main writer), `.claude/skills/workspace/placement.mjs:1` (borrows `splitFrontmatter`), `.claude/skills/memory-index/migrate.mjs` (both validators).
