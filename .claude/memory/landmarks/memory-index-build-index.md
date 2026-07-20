---
key: .claude/skills/memory-index/build-index.mjs
category: landmarks
scope: [scout]
verified-at: 86a2bb3
last-touched: 2026-07-18
---

- Role: Domain — builds the graph index injected at session start. Reads only each fact file's frontmatter + one-line hook (never the body), so the upfront memory payload stays bounded regardless of store size.
- Part of the T4 sharded-memory redesign (one-fact-per-file store). Companions: [[memory-index-migrate]] (flat↔sharded conversion), the shared reader [[memory-frontmatter-parser]], and phase-scoped surfacing [[memory-scoped-memory]].
