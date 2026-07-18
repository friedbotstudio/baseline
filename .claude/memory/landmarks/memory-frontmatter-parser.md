---
key: .claude/hooks/lib/frontmatter-parser.mjs
category: landmarks
scope: [scout]
---

- Role: Foundation — the single shared reader for a fact file's YAML-ish preamble. Used by `build-index`, `scoped-memory`, and `migrate` so the parse rule lives in one place. Change the frontmatter grammar here, not in each consumer.
- Verified-at: 86a2bb3
- Last-touched: 2026-07-18
