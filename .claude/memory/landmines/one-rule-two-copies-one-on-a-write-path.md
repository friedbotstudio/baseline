---
key: one-rule-two-copies-one-on-a-write-path
category: landmines
scope: [implement, tdd]
source: incident
verified-at: 1a2cce3
last-touched: 2026-07-20
---

- Path: `.claude/skills/memory-index/lift-fields.mjs` (now the ONLY definition) ← formerly duplicated at `.claude/skills/memory-index/migrate.mjs:81` and `.claude/skills/memory-sync/shape.mjs:40`.
- Trap: the T4 shard migration's field-lifting regex existed in TWO byte-identical copies. The repair spec named only `migrate.mjs`, because that is where the bug was *observed*. The second copy sat on a **write path**: `sweep.mjs:88` round-trips shards through `shape.mjs → writeShardedFromFlat` on every `stamp-closure` (fired automatically by `/commit`) and `auto-close` (fired by `/memory-sync`).
- Consequence: fixing the observed copy alone would have been **self-undoing** — the very next `/commit` would re-strand what the repair had just fixed, and nothing in the spec's write-set could have prevented it. The regression would have looked like the repair "not sticking" rather than like a second copy.
- Tell: a rule expressed as a literal (regex, constant, predicate) appearing in more than one module, where at least one occurrence is reached from a write/persist path. Grep the *shape* of the literal, not its text — a cosmetic edit to one copy defeats a text search.
- Fix shape: one shared definition, per-caller POLICY documented at each call site. `lift-fields.mjs` exports the regex via `parseFieldBullet`; `migrate`/`relift` apply the reader-derived allowlist, `shape.mjs` restores its own lowercase emissions, `toEntry` reads all names. Same regex, three explicit policies — not three rules wearing a shared coat.
- Enforcement: `tests/lift-fields-single-definition.test.mjs` asserts exactly one definition repo-wide by scanning for the regex SHAPE across `.claude/skills`, `.claude/hooks`, `src`.
- Family: the sibling "two hand-maintained surfaces drift silently" pattern — [[live-template-config-drift-silent]] and [[shard-migration-dropped-capitalized-field-bullets-staleness-blind]].
