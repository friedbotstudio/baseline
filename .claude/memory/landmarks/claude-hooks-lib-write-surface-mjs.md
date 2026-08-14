---
key: .claude/hooks/lib/write-surface.mjs
category: landmarks
scope: []
governs: .claude/hooks/lib/write-surface.mjs, .claude/hooks/lib/scoped-memory.mjs, .claude/skills/triage/SKILL.md
verified-at: 33953da
last-touched: 2026-08-14
---

- Path: `.claude/hooks/lib/write-surface.mjs`. Reads the workflow's declared write surface, the oracle the phase-scoped memory filter narrows against (roadmap Epic 6 T11).
- Role: exports `readWriteSurface({rootDir})` — parses `.claude/state/workflow.json → write_surface[]` and returns validated repo-relative globs — and `sanitizePatterns(patterns)`, the member-level validator underneath it.
- Why it exists: scout is the phase that DISCOVERS which paths a change touches, so nothing can derive the surface at scout time. It has to be declared upstream by `/triage`, and this module is where that declaration is read.
- **Fail-open is the contract, not a fallback.** Every negative path returns `[]` — absent file, unreadable JSON, absent key, non-array, every member dropped. An absent surface means "narrow nothing", never "surface nothing", which is what lets the filter ship without a feature flag: the off state is the default state of every workflow already on disk.
- Two rejection rules, both REJECT rather than repair. Absolute paths, drive prefixes and `..` segments are dropped (CWE-22, defense in depth — a member is only ever string-compared, never used to build a path). A run of more than `MAX_STAR_RUN` (3) consecutive `*` is dropped (CWE-1333); no legitimate glob needs more than `**`.
- The star bound and the `globToRegex` run-collapse in `write-set-profile.mjs` are two layers, not one fix twice. The bound covers only this path; the matcher fix also covers the pre-existing `project.json` callers the bound never sees. Neither alone satisfies spec AC-011.
- Companion: `.claude/hooks/lib/scoped-memory.mjs` (`entryPaths` + `narrowToWriteSurface`, the consumer), `.claude/hooks/lib/write-set-profile.mjs` (`pathOverlapsWriteSet`, the one-directional predicate this feeds), `.claude/hooks/process_lifecycle_guard.mjs` (the caller that reads the surface and passes it to the phase leg).

- load_bearing: true
