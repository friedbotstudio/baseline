---
key: src/cli/project-json-merge.js:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: structural 3-way JSON merge for `.claude/project.json` on upgrade — promoted from NEVER_TOUCH to SPECIAL_MERGE tier during the 2026-05-27 perf pass. For each leaf field K, if local equals base (user never customized) → take incoming; else keep local. Nested objects recurse; arrays treated atomically. New fields in incoming added; user-removed fields stay removed; user-added fields preserved. Exports pure `structuralMerge3Way(base, incoming, local)` plus file I/O wrappers `computeMergedProjectJson({...})` and `mergeProjectJsonFile({...})`. BASE recovery via `src/cli/upgrade-tiers.js → resolveBase`; falls back to LOCAL preservation (NEVER_TOUCH semantics) when BASE unavailable.
- Companion: `src/cli/merge.js` → `applyProjectJsonMerge` (the SPECIAL_MERGE registry handler that calls this module), `src/cli/mcp.js` (sibling registry handler for `.mcp.json`), `src/cli/install.js → SPECIAL_MERGE` + `scripts/build-manifest.mjs → SPECIAL_MERGE_PATHS` (kept in sync via `tests/never-touch-sync.test.mjs`).
- Caveat: arrays are atomic. Future refinement: set-union for known list-shaped fields. Unit-tested in `tests/project-json-merge.test.mjs` (15 scenarios).
