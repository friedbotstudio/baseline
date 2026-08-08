---
key: frontmatter-values-reach-regex-and-structured-writes-unescaped
category: landmines
scope: []
governs: .claude/skills/memory-index/index-io.mjs, .claude/skills/memory-index/resolve.mjs, .claude/skills/memory-flush/ledger.mjs, .claude/skills/memory-index/constraints.mjs
load_bearing: true
verified-at: f7da5a7
last-touched: 2026-08-04
---

- Memory frontmatter is authored content, not a trusted pattern language. Three defects of this shape were confirmed by execution in the 2026-08-04 security review (`docs/archive/2026-08-04/living-system-model-abcd/security.md`, findings F-1/F-2/F-3). Assume a fourth exists wherever a frontmatter value reaches a regex or a line-delimited file.
- **`governs:` into `new RegExp`** — `index-io.mjs → matchesGlob()` escapes regex metacharacters but originally omitted `?`, so a shard carrying `governs: ?` raised `Invalid regular expression: /^?$/: Nothing to repeat`. It propagated out of `resolveLookup`, whose contract says it never throws.
- **The catch made it worse, not better.** `governed-memory.mjs` wrapped a whole CATEGORY in one `try`, so a single bad glob silently suppressed every decision in `decisions/` — an advisory control failing closed and quietly. The `try` now sits inside the per-entry loop. Escaping the metacharacter and bounding the catch are two separate fixes; doing only the first leaves the blast radius wrong.
- **Unanchored `/m` over a whole file** — `backfillScopeAny()` probed `^scope:` with `/m` across the entire shard, matching a BODY line that began `scope:` and skipping the entry. Entries in this corpus routinely quote frontmatter keys while documenting the schema, so this collision is ordinary. Split the frontmatter block first; the store already owns a parser.
- **Unvalidated key into a line-delimited file** — `ledger.mjs → recordCuration()` interpolated `key` into `- <disposition> :: <key>\n`. A newline wrote a second, forged row, and because `decidedKeys()` feeds `memory_stop`'s suppression set, a forged key **permanently silences an unrelated future candidate**. `disposition` was bounded by a closed set; `key` was not. Same class in `constraints.mjs → renderConstraint()`, now using `assertSafeFactKey`.
- Reusable validator: `assertSafeFactKey` in `.claude/skills/memory-index/migrate.mjs` (`/^[a-z0-9][a-z0-9-]*$/`). Reuse it rather than writing a second one.
