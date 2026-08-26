---
key: .claude/skills/memory-index/categories.mjs:1
category: landmarks
scope: []
governs: .claude/skills/memory-index/**, .claude/hooks/lib/memory_session_start.mjs, .claude/hooks/lib/scoped-memory.mjs, .claude/skills/audit-baseline/**
verified-at: 7d7039c
last-touched: 2026-08-26
---

- Path: `.claude/skills/memory-index/categories.mjs`. The single source of the canonical memory categories and the decay classes that apply to them.
- Role: exports `CANONICAL` (8, frozen), `PENDING_FILE`, `STALE_EXEMPT`, `SUPERSESSION_DRIVEN`, `closureFieldFor()`, `readLoadBearing()`, `asList()`. Every other reader imports from here rather than keeping its own literal.
- Why it exists: the list was hardcoded in NINE places before this. See the `canonical-category-list-spans-nine-surfaces` landmine for the full inventory and why seven of the nine fail silently.
- `asList()` is here rather than in the frontmatter parser because multi-value fields (`governs:`, `rests_on:`) round-trip through a comma-joined string — `asArray()` alone returns one glued element.
- Not hash-checked: `memory-index/` has no `SKILL.md`, so it is outside `audit-baseline`'s skill-ownership drift check (Article XII.5). Editing it does not require `npm run manifest:refresh`; editing anything under `memory-sync/` or `audit-baseline/` does.
- **The manifest is not the oracle for that, and checking it will mislead you.** `obj/template/.claude/manifest.json` carries nine entries under `memory-index/`, so the files ARE hashed for the installed-tree smoke check. What skips them is the dev-tree drift check, which walks only directories whose `SKILL.md` declares `owner: baseline`. Verified 2026-08-26 by appending a comment line and running the audit: PASS, zero fails.
