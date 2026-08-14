---
key: shard-migration-dropped-capitalized-field-bullets-staleness-blind
category: landmines
scope: [chore, tdd]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/memory-index/migrate.mjs:81` (field-lifting regex) → `.claude/hooks/lib/memory_session_start.mjs:128` (`readShardedCategory`, frontmatter-only reader).
- Trap: the T4 shard migration (`e8d1480`) lifts flat-file body bullets into per-fact **frontmatter** using `/^-\s+([a-z][a-z-]*):\s+(.+)$/` — **lowercase-anchored**. The live corpus wrote its stamps capitalized (`- Verified-at: <sha>`, `- Last-touched: <date>`), so those bullets never matched, were never lifted, and stayed in the body. `verifyMigrationFidelity` only asserts block-count == file-count, so it reported a clean, "lossless" migration.
- Consequence: the session-start index is frontmatter-only **by design** (README:80, for cheap upfront context). An entry whose stamps stayed in the body therefore has no visible `verified-at`/`last-touched` → `isStale()` falls through both branches and returns `false` → the entry is **permanently fresh**. This silently disables the Article IX.5 decay/self-healing predicate for **127 of 199 entries** (landmarks 78/81, libraries 9/12, landmines 26/50, decisions 11/27, conventions 3/16).
- Tell: the session-start index reports a category with many entries and **0 stale** (landmarks 81/0 is the giveaway), while `sweep.mjs` — which reads shards via `shape.mjs → readShardedAsFlat` → `factToBlock(frontmatter, body)`, i.e. frontmatter **and** body — sees the real number. Measured 2026-07-18: hook says **46 stale**, sweep says **156**. Two readers of one store, disagreeing by 110 entries.
- Do NOT run a stale sweep to "clean this up" before repairing the data: the sweep curates against the 156-entry set while every other surface believes 46, and re-stamping entries in the body leaves them just as invisible.
- Fix shape: case-insensitive field regex in `migrate.mjs`, a re-lift pass over already-migrated shards, and extend `verifyMigrationFidelity` to assert **field** fidelity (per-entry frontmatter key set), not just block/file counts. Write new shard entries with stamps in the frontmatter — as this entry does.
- Family: same root cause class as the `standup` reader blindness — `.claude/skills/standup/gather.mjs` reads flat `backlog.md`/`pending-questions.md` and reports `no-backlog` in `degraded[]` while 12 backlog shards exist. The T4 migration landed the new store without updating every reader; audit both when repairing. See [[live-template-config-drift-silent]] for the sibling "two hand-maintained surfaces drift silently" pattern.
