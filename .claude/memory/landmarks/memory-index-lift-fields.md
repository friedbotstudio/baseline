---
key: .claude/skills/memory-index/lift-fields.mjs
category: landmarks
scope: [scout]
source: inferred-from-code
verified-at: 1a2cce3
last-touched: 2026-07-20
---

- Role: Foundation. The single field-lifting rule for the memory store, plus the frontmatter serializer and the shape-agnostic category resolver every reader routes through.
- Exports: `LIFTABLE_FIELDS` (7 reader-backed names), `STRUCTURAL_FIELDS` (`key`/`category`/`scope`, dropped not lifted), `liftFields(body, existingFrontmatter)` → `{fields, bodyLines, collisions}`, `emitFrontmatter(map)` (exact inverse of `parseFrontmatter`, throws rather than coercing), `resolveCategory(memRoot, category)` → `{entries, source, degraded}` (**shard-first**), `strandedFieldBullets(memRoot)`, `parseFieldBullet(line)`, `splitBodyLines(body)`.
- Consumers: `migrate.mjs` (+`reliftShards`), `shape.mjs`, `build-index.mjs`, `scoped-memory.mjs`, `standup/gather.mjs`, `memory-flush/next-q-id.mjs`, `memory-flush/sweep.mjs` (via `strandedFieldBullets`).
- Caveat: three DIFFERENT lifting policies deliberately share this one regex — write-path (allowlist-bounded), `shape.mjs` round-trip (restores its own lowercase emissions), and read-path `toEntry` (all names, because a flat entry's `- scope:` bullet IS the data). Each is documented at its call site. Do not "unify" them; see [[one-rule-two-copies-one-on-a-write-path]] for why the regex is shared and [[count-invariants-cannot-see-field-placement]] for why the policies are not.
- Resolution is shard-first because a failed `migrateForward` leaves BOTH stores present (it writes shards, asserts, then deletes flat) — flat-first would serve stale data in exactly the state where correctness matters most.
