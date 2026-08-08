---
key: .claude/skills/spec-sync/SKILL.md:1
category: landmarks
scope: []
governs: .claude/skills/spec-sync/SKILL.md, .claude/skills/workspace/sync.mjs, docs/system/**
verified-at: d4e6216
last-touched: 2026-08-06
---

- Path: `.claude/skills/spec-sync/SKILL.md`. The 57th baseline-owned skill, added by ticket F of `central-system-spec` (2026-08-06). Category **maintenance** (now 3: `upgrade-project`, `gitignore`, `spec-sync`).
- Role: derive-then-curate bootstrap of the central system spec for a repository that has never had one. Scans the governed surface, proposes a concept map clustered by directory, and materializes elements and shards **only after a human confirms that map**.
- **Category placement is pinned by a test.** It was first filed under `generators`; `tests/whatsnew-counts.test.mjs:21` asserts the maintenance roster, so the miscategorization failed the suite. If this skill moves category, that test moves with it.
- **This is the first brownfield-adoption capability in the baseline.** Everything else assumes the harness was present from the start. The public site does not say so yet — the argument belongs on `install.njk`/`overview.njk`, not the skills roster, and the 68%-of-governed-files-in-no-spec figure is its proof point (currently recorded only in a spec).
- Adding a skill cascades counts: `seed.md §4.3`, the CLAUDE.md/README orientation lines, and three docsite literals all carry the total. `audit-baseline` fails the build on drift, so let it tell you what to update rather than grepping.
- Companions: `.claude/skills/workspace/sync.mjs` (the engine, where `confirm` is enforced), `docs/system/README.md` (what a consumer reads next).
