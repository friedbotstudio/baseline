---
key: repair-shard-migration-field-lifting-and-stale-readers-b4e1
category: backlog
scope: []
status: open
raised-on: 2026-07-18
raised-in-context: (no active workflow — /standup + /memory-flush)
source: assistant-deferral
estimated-effort: medium
verified-at: f36b142
last-touched: 2026-07-18
---

> verbatim (assistant, 2026-07-18):
> "The T4 shard migration lifted body bullets into frontmatter with a lowercase-anchored regex, so every capitalized `- Verified-at:` stamp stayed in the body. The frontmatter-only session-start reader can't see them, so 127 of 199 entries are permanently non-stale — the decay predicate is silently disabled. And `gather.mjs` still reads flat `backlog.md`, reporting `no-backlog` while 12 shards exist. The migration landed the new store without updating every reader."

- Intent: repair the T4 (`e8d1480`) sharded-store migration fallout in three parts.
  1. **Field lifting** — make the `migrate.mjs:81` regex case-insensitive and run a re-lift pass over the already-migrated corpus so body `- Verified-at:` / `- Last-touched:` bullets land in frontmatter. 127 entries affected.
  2. **Fidelity assertion** — extend `verifyMigrationFidelity` to compare per-entry frontmatter **field sets**, not just block-count vs file-count. The current check passed a migration that dropped every stamp; a count-only invariant cannot catch field loss.
  3. **Reader audit** — sweep every consumer of the memory store for flat-file assumptions. Known blind: `.claude/skills/standup/gather.mjs` (reads flat `backlog.md` + `pending-questions.md`, emits `no-backlog` / `no-pending-questions` into `degraded[]` while 12 + 1 shards exist — it under-reports as "missing precondition", which reads as "the backlog is empty"). Known good: `sweep.mjs` and `memory_session_start.mjs`'s sharded path (both shard-aware, though the latter is frontmatter-only by design).
- Why it matters: part 1 restores Article IX.5 decay/self-healing, which is currently inert for 64% of the corpus. Part 3 is a correctness bug in a shipped skill — `/standup` silently claims an empty backlog.
- Sequencing note: do **not** run a stale sweep before part 1 lands. The two readers currently disagree (hook 46, sweep 156); curating against the larger set while every other surface believes the smaller one would churn entries without fixing the invisibility.
- Detail + measurements: [[shard-migration-dropped-capitalized-field-bullets-staleness-blind]].
