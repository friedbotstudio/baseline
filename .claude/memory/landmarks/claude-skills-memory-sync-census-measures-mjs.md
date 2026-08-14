---
key: .claude/skills/memory-sync/census-measures.mjs
category: landmarks
scope: [scout]
governs: .claude/skills/memory-sync/census-measures.mjs
role: The named measures a census site can be pinned to. A measure counts the store as it will be AFTER the flush - entries on disk plus the pending ones about to be written - which is what makes the re-measure correct in the same commit rather than one flush behind. Only one measure ships (landmarks-with-scope-scout); an unrecognised name throws UnknownMeasureError past measureCensusMovement rather than refusing, which is a flagged gap.
source: inferred-from-code
verified-at: 66fcb29
last-touched: 2026-08-14
---
