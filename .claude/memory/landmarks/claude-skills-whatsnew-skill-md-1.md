---
key: .claude/skills/whatsnew/SKILL.md:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: On-demand "what's new" generator (NOT a workflow phase; replaced the former Phase 11.5 `changelog` skill). Main context writes keepachangelog-style entries; the generator emits a structured fragment to `.claude/state/whatsnew/<slug>.json` (gitignored, transient). Optional `project.json -> whatsnew.route_workflow` names a per-project routing workflow that consumes the fragment. Never writes `CHANGELOG.md` (owned solely by `@semantic-release/changelog` at release time).
- Companion: `.claude/skills/whatsnew/fragment-writer.mjs:1`, `.claude/skills/whatsnew/route-resolver.mjs:1`, `.claude/skills/whatsnew/whatsnew.mjs:1` (entrypoint), `.claude/skills/whatsnew/classifier.mjs:1` (now only the KEEPACHANGELOG_SECTIONS constant). Category: `generators` (the 13th SKILL_CATEGORIES bucket; phases dropped 11->10).
- Caveat: the skill dir was `git mv`d from `changelog`; the manifest owners.skills key is `whatsnew`. CHANGELOG.md is no longer touched by any skill. The bootstrapping commit that introduced this (slug changelog-generator-routing) self-excepted its own `changelog` workflow node.
