---
key: .claude/skills/workspace/sync.mjs:1
category: landmarks
rests_on: zero-runtime-dependencies
scope: []
governs: .claude/skills/workspace/sync.mjs, .claude/skills/spec-sync/SKILL.md, docs/system/**
verified-at: 7d7039c
last-touched: 2026-08-26
---

- Path: `.claude/skills/workspace/sync.mjs`. Orchestration — the engine behind `/spec-sync`, which bootstraps a central system spec for a repository that has never had one. Added by ticket F of `central-system-spec` (2026-08-06).
- Role: `runSync({rootDir, specDir, confirm})` scans the governed surface, clusters by directory into proposed concepts, then materializes elements and shards, derives edges and stamps digests.
- **`confirm` is mandatory and there is no `--yes`.** `runSync` throws without it. Spec D9: a human always confirms the proposed concept map before anything is materialized, because the map is the authored layer and deriving it silently would make the corpus a guess with a spec's authority. The human reviews roughly 15 concept rows, not ~110 element records — that ratio is what makes the confirmation real rather than rubber-stamped.
- **It exists because a consumer has no spec archive to migrate from.** Measured on this repo, 359 of 526 governed files (68%) appear in no spec at all, and tracks like `chore` and `freeform` skip `/spec` by design. Rebuild-from-code is the only path a brownfield adopter has.
- Hostile-filename safe end to end: probed with `lib/..evil/x.mjs`, `lib/a b/y.mjs`, `lib/UPPER.mjs`, `lib/-lead.mjs` — 4 elements written, every filename matching `^[a-z0-9][a-z0-9-]*\.md$`, nothing written outside `specDir`.
- Re-runnable. A second run over a populated corpus is not a reset; it proposes what is missing.
- Companions: `.claude/skills/spec-sync/SKILL.md` (the operator-facing skill), `.claude/skills/workspace/materialize.mjs`, `.claude/skills/workspace/coverage.mjs`, `.claude/skills/workspace/surface.mjs`.
