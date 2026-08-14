---
key: .claude/hooks/lib/frontmatter-parser.mjs
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Foundation — the single shared reader for a fact file's YAML-ish preamble. Used by `build-index`, `scoped-memory`, and `migrate` so the parse rule lives in one place. Change the frontmatter grammar here, not in each consumer.
