---
key: .claude/skills/whatsnew/fragment-writer.mjs:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: Foundation. Exports `writeFragment({repoRoot, slug, entries, now})` -> writes `.claude/state/whatsnew/<slug>.json` as `{slug, generated_at, entries[{category,title,body,highlight?}]}` (NO version field). Validates non-empty entries, each with category (in KEEPACHANGELOG_SECTIONS) + title + body. `requireSafeSlug` rejects slugs not matching `^[a-z0-9][a-z0-9-]*$` (path-traversal guard, CWE-22). Never touches CHANGELOG.md.
