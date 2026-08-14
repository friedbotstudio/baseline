---
key: count-invariants-cannot-see-field-placement
category: landmines
scope: [spec, tdd, integrate]
source: incident
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/memory-index/migrate.mjs → verifyMigrationFidelity` (now three-sided).
- Trap: the original migration asserted only `blocks === files`. Both numbers were correct while every metadata stamp sat misplaced in an entry body, so it reported a clean, lossless migration. **A count invariant cannot see WHERE data landed** — only how much of it there is.
- Consequence: 127 of 199 entries silently lost their `verified-at`/`last-touched` visibility, disabling the Article IX.5 decay predicate for 64% of the corpus. The migration's own check certified this as lossless.
- Second-order trap: the obvious repair (assert nothing was *dropped*) is also insufficient. A conservation check is **body-side** — it passes when a lift overwrites a pre-existing FRONTMATTER key, because the body is still correct and nothing vanished. That is how a `source: user-instruction` value (which makes an Art. IX.6 verbatim blockquote mandatory) could be replaced by an archive pointer with every assertion green, and the idempotence re-run would then report `relifted: 0, corpus byte-identical` — green while already corrupt.
- Fix shape: assert per-entry, on every side the transform can be lossy. Here that is three: `residual-metadata` (something that should have moved did not), `dropped-prose` (something that should have stayed was eaten), `clobbered-field` (something pre-existing was overwritten). Run the assertion over ALL entries BEFORE the first write, so a violation leaves the corpus untouched.
- Tell: a data migration whose only verification is a count, a checksum of counts, or "it ran without throwing". Ask what the check would say if every record were present but wrong.
- Enforcement: `tests/migration-fidelity-three-sided.test.mjs` covers each side plus a negative control (all-clean must NOT throw — without it, an implementation that throws unconditionally passes every positive case).
