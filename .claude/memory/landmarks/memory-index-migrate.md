---
key: .claude/skills/memory-index/migrate.mjs
category: landmarks
scope: [scout]
source: inferred-from-code
verified-at: 1a2cce3
last-touched: 2026-07-20
---

- Role: Domain — migrates the seven flat canonical memory files to per-fact category directories and back, and repairs an already-migrated store in place. The actuator behind the flat→sharded move (T4) and its repair.
- Modes: `--forward` (explode `## <heading>` blocks into `<category>/<slug>.md`), `--reverse` (recompose), `--relift` (move stranded `LIFTABLE_FIELDS` bullets from entry bodies into frontmatter; idempotent, exit 1 when `refused > 0`).
- Exports: `migrateForward`, `migrateReverse`, `reliftShards`, `verifyMigrationFidelity`, `MigrationFidelityError`, `assertSafeFactKey`, `factKeyFromHeading`.
- Delegates the lifting rule to [[.claude/skills/memory-index/lift-fields.mjs]] — it holds no regex of its own. See [[one-rule-two-copies-one-on-a-write-path]].
- Caveat: `verifyMigrationFidelity(perCategory, perEntry)` is **three-sided** — `residual-metadata`, `dropped-prose`, `clobbered-field` — and runs over every entry BEFORE the first write, so a violation leaves the corpus untouched. The original count-only check certified a stamp-stranding migration as lossless; see [[count-invariants-cannot-see-field-placement]].
- Caveat: `reliftShards` REFUSES an entry whose body bullet would overwrite a differing frontmatter key, leaving it byte-identical and reporting the collision. REJECT-never-normalize — two meanings sharing one name cannot be separated mechanically.
