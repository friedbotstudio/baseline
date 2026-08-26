---
key: .claude/skills/spec-sync/SKILL.md:1
category: landmarks
scope: []
governs: .claude/skills/spec-sync/SKILL.md, .claude/skills/workspace/sync.mjs, docs/system/**
verified-at: 7d7039c
last-touched: 2026-08-26
---

- Path: `.claude/skills/spec-sync/SKILL.md`. Added by ticket F of `central-system-spec` (2026-08-06) as the 57th baseline-owned skill; the roster has grown since, so read the count from `derive-counts.mjs` rather than from here. Category **maintenance**, which `SKILL_CATEGORIES` puts at 4 as of 2026-08-26.
- Role: derive-then-curate bootstrap of the central system spec for a repository that has never had one. Scans the governed surface, proposes a concept map clustered by directory, and materializes elements and shards **only after a human confirms that map**.
- **Category placement is pinned by arithmetic, not by a roster assertion.** It was first filed under `generators`, and `tests/whatsnew-counts.test.mjs` failed because that test pins `generators` and `phases` and then asserts the category sum equals the derived total — a skill in the wrong bucket breaks the sum. Corrected 2026-08-26: that test never named `maintenance`, and this entry claimed it asserted the maintenance roster at line 21.
- **This is the first brownfield-adoption capability in the baseline.** Everything else assumes the harness was present from the start. The public site does not say so yet — the argument belongs on `install.njk`/`overview.njk`, not the skills roster, and the 68%-of-governed-files-in-no-spec figure is its proof point (currently recorded only in a spec).
- Adding a skill cascades counts: `seed.md §4.3`, the CLAUDE.md/README orientation lines, and three docsite literals all carry the total. `audit-baseline` fails the build on drift, so let it tell you what to update rather than grepping.
- Companions: `.claude/skills/workspace/sync.mjs` (the engine, where `confirm` is enforced), `docs/system/README.md` (what a consumer reads next).
