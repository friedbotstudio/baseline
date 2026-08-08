---
key: .claude/skills/workspace/surface.mjs:1
category: landmarks
scope: []
governs: .claude/skills/workspace/surface.mjs, .claude/skills/workspace/coverage.mjs, .claude/skills/workspace/witness.mjs, .claude/project.json
rests_on: zero-runtime-dependencies
verified-at: d4e6216
last-touched: 2026-08-06
---

- Path: `.claude/skills/workspace/surface.mjs`. Foundation — resolves which files a project's central system spec is expected to cover. Added by ticket B of `central-system-spec` (2026-08-06).
- Role: `resolveGovernedSurface({rootDir})` reads `project.json → memory.architecture_map.governed_surface` and returns its `roots`, `codeExtensions`, `alwaysIncluded`, `excludedSegments` and `excludedTrees`. Also exports `readProjectConfig`, shared with `witness.mjs` so the two do not each re-parse the config.
- **It exists to make the corpus usable by projects that are not this one.** The surface used to be `GOVERNED_SURFACE`, a hardcoded constant inside the now-deleted `seed-map.mjs` — a baseline-owned, hash-protected file. A consumer editing it to declare their own roots tripped Article XII hash drift, which has no opt-out. Moving it to config removed that blocker; a Python or Go project now declares its own surface.
- **Refuses rather than defaults.** An absent or malformed `governed_surface` throws, naming the config key. There is deliberately no fallback: defaulting to baseline's own roots would report total coverage over a surface nobody asked about, which is worse than an error because it looks like success.
- Callers: `coverage.mjs` (`findGaps`, `governedFiles`) and `/archive`'s sync-back path when scoping touched paths. `coverage.mjs` reads the surface through this one import, which is why the config move changed the source and not the call sites.
- Do not confuse the governed surface with the corpus. Files under `docs/system/` are the model; the governed surface is what the model must account for. A corpus relocation contributes no touched paths.
- Companions: `.claude/skills/workspace/coverage.mjs` (the consumer), `.claude/skills/workspace/witness.mjs` (shares `readProjectConfig`), `docs/system/README.md` (the reader-facing rule).
