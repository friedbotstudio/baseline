---
key: canonical-category-list-spans-nine-surfaces
category: landmines
rests_on: zero-runtime-dependencies
load_bearing: true
scope: []
governs: .claude/skills/memory-index/**, .claude/hooks/lib/**, .claude/skills/audit-baseline/**, site-src/_data/memorynotes.json, tests/helpers/memory-fixtures.mjs
verified-at: 7d7039c
last-touched: 2026-08-26
---

- Adding or removing a canonical memory category touches **nine** surfaces. Since 2026-08-04 they all import `CANONICAL` from `.claude/skills/memory-index/categories.mjs`, so the correct edit is one line there — but if that import is ever unwound, this is the inventory.
- The dangerous property: **seven of the nine fail SILENTLY.** A reader holding a stale literal returns nothing for the new category and raises no error anywhere. Only two fail loudly, and they are the only reason the true count was discoverable at all.
- Silent seven: `hooks/lib/memory_session_start.mjs` (index + decay sweep), `hooks/lib/scoped-memory.mjs` (phase-scoped surfacing returns `[]`), `skills/memory-index/lift-fields.mjs` (stranded-field census), `skills/memory-index/build-index.mjs`, `skills/memory-index/migrate.mjs`, `skills/audit-baseline/checks/memory.mjs`, `tests/helpers/memory-fixtures.mjs` (every fixture in the suite skips the category's shards).
- Hard two: `skills/audit-baseline/memory-shape.mjs` gates on `categories === CANONICAL.length`, so a correctly-registered store reads as an audit FAIL. `site-src/_data/memorynotes.json` is checked by `site-src/_data/roster.cjs`, which throws `memorynotes.json out of sync with the audit's CANONICAL list` and renders zero pages — this takes the whole docs-site test suite down with it.
- A 10th surface is a TEST, not a reader: `tests/memory-shard-audit.test.mjs` seeds a full store and asserts the count. It now derives both from `CANONICAL`; if you see it hardcode a number again, that is the regression.
- Trap within the trap: editing anything under `.claude/skills/memory-sync/` or `.claude/skills/audit-baseline/` invalidates the manifest hash, and `test.cmd` runs the FULL audit on every `.claude/**` write. Run `npm run manifest:refresh` immediately, not at the end, or every later edit reads a `hash mismatch` caused by the earlier one.
