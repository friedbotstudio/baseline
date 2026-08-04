---
key: .claude/skills/memory-index/categories.mjs:1
category: landmarks
scope: any
governs: .claude/skills/memory-index/**,.claude/hooks/lib/memory_session_start.mjs,.claude/hooks/lib/scoped-memory.mjs,.claude/skills/audit-baseline/**
verified-at: f7da5a7
last-touched: 2026-08-04
---

- Path: `.claude/skills/memory-index/categories.mjs`. The single source of the canonical memory categories and the decay classes that apply to them.
- Role: exports `CANONICAL` (8, frozen), `PENDING_FILE`, `STALE_EXEMPT`, `SUPERSESSION_DRIVEN`, `closureFieldFor()`, `readLoadBearing()`, `asList()`. Every other reader imports from here rather than keeping its own literal.
- Why it exists: the list was hardcoded in NINE places before this. See the `canonical-category-list-spans-nine-surfaces` landmine for the full inventory and why seven of the nine fail silently.
- `asList()` is here rather than in the frontmatter parser because multi-value fields (`governs:`, `rests_on:`) round-trip through a comma-joined string — `asArray()` alone returns one glued element.
- Not hash-checked: `memory-index/` has no `SKILL.md`, so it is outside `audit-baseline`'s skill-ownership drift check (Article XII.5). Editing it does not require `npm run manifest:refresh`; editing anything under `memory-flush/` or `audit-baseline/` does.
