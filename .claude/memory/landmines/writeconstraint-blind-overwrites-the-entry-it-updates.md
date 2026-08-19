---
key: writeconstraint-blind-overwrites-the-entry-it-updates
category: landmines
load_bearing: true
scope: [memory-sync]
governs: .claude/skills/memory-index/constraints.mjs, .claude/skills/memory-index/cli.mjs, .claude/skills/lib/argv.mjs
verified-at: 69c3259
last-touched: 2026-08-19
---

- Path: `.claude/skills/memory-index/constraints.mjs → writeConstraint`, reached through `memory-index/cli.mjs constraint`.
- Landmine: **the sanctioned front door for updating a constraint destroys the entry it updates.** It is a blind `writeFileSync` of a five-field render, not an update, so `scope:`, `verified-at:`, `last-touched:` and the entire body are gone. The CLI passes no `body`, so a flag-driven state flip always empties it.

**Measured 2026-08-13, flipping `no-jvm-available` from `true` to `false`.** Before: eight frontmatter fields and a five-bullet body carrying the decisions that rested on it. After one `constraint --key ... --state false --governs ...`:

```
key / category / state / state_verified_at / governs
(body: empty)
```

`renderConstraint` emits exactly `key`, `category`, `state`, `state_verified_at`, `governs`, then `fields.body ?? ''`. Everything else it was never told about is not preserved, because there is no read-modify-write — the same defect class as [[a-synthesizing-writer-erases-fields-its-arguments-cannot-carry]], in the module that curates the memory those entries live in.

**A second defect fires on the same call.** `--verified-at` is NOT in `VALUE_FLAGS` in `.claude/skills/lib/argv.mjs`. Under `strict: false` it parses as the boolean `true` and the value leaks into positionals, so the entry lands with `state_verified_at: true` — a boolean where a SHA belongs. That is precisely the hazard `argv.mjs`'s own module header documents ("an undeclared `--hops 2` parses as `hops: true` and leaks `2` into positionals"), fired on the flag list's own gap.

- **How to survive it today:** read the entry first, keep its bytes, and after calling the writer restore `scope:`, `verified-at:`, `last-touched:` and the body by hand. `/memory-sync` is the sanctioned curator, so writing the file directly from that phase is legitimate; do not reach for the CLI expecting an update.
- **The real fix, when someone takes it:** make `writeConstraint` read the existing entry and merge, preserving unknown frontmatter and the body unless a caller explicitly replaces them; and add `verified-at` to `VALUE_FLAGS`. Both are small. Neither has a test today, which is why a data-destroying writer reads as working.
- **Why it went unnoticed:** the writer's job is registration-gated (`UnregisteredCategoryError`, AC-010), and the guard it carries is about the CATEGORY, not the CONTENT. A loud guard on one axis reads as care on every axis.
