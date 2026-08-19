---
key: claude-skills-workspace-restore-degraded-shards-mjs
category: landmarks
scope: [scout]
governs: .claude/skills/workspace/restore-degraded-shards.mjs
verified-at: 69c3259
last-touched: 2026-08-19
---

- Role: the corpus's repair path. Restores diagram shards a rewrite collapsed to the three-argument `Component` form. Reached at `node .claude/skills/workspace/cli.mjs restore-shards [--dry-run]`; the module exports `restoreDegradedShards({rootDir, specDir, dryRun})`.
- Source order is the design: **git history first, element record only as a fallback.** Records carry no `techn`, and 51 shards declare `subsystem` there while their record reads `kind: component`, so a record-first repair would destroy the one field it cannot recover.
- Report is three partitions — `restored` (git, lossless, carries the source `sha`), `recordRestored` (label from anchor, description from title, `techn` left at the kind), `unrestorable` (named, never reconstructed). Collapsing them to one count would claim a fidelity two thirds of the rows do not have.
- Candidates are matched by FINGERPRINT (label equals element id AND techn equals kind), not by argument count: two live shards legitimately carry three arguments and real labels.
- The section is derived from the element id via `sectionFromElementId`, never read back from the file under repair — `Component([^,]+, …)` admits quotes and parens, and reading it back let a corrupt shard propagate into a file the repair reported as restored (security review 2026-08-12, MEDIUM).
- `classifyEntry` lstats each entry: a symlink is reported `unrestorable` rather than written through (CWE-59), and a directory wearing a `.puml` name is skipped rather than read (an `EISDIR` would abort the whole sweep).
- Companions: `shards.mjs` (`writeDiagramShard`, `renderComponentLine`, `sectionFromElementId`), `store.mjs` (`readRecords`), `queries.mjs` (`restoreShards` handler).
- Standing guard: `tests/corpus-shard-preservation.test.mjs` fails if any live shard carries the three-argument form again.
