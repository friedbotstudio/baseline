---
key: .claude/skills/memory-index/index-io.mjs:12
category: landmarks
scope: []
governs: .claude/skills/memory-index/**, .claude/hooks/lib/governed-memory.mjs
verified-at: 39464a1
last-touched: 2026-08-04
---

- Path: `.claude/skills/memory-index/index-io.mjs`. Foundation layer under the derived index — the only place in `memory-index/` that touches the filesystem or builds a regex.
- Role: exports `everyShardPath(memDir)` (enumerates `<category>/*.md` across `CANONICAL`) and `matchesGlob(glob, path)`. Split out of `resolve.mjs` specifically so that module stays Domain: reverse-lookup rules, no IO, no `child_process`, no bare regex.
- Epic decision D5: `governs:` anchors to **path globs, not `path:line`**. `landmines.md` uses `path:line` and it drifts on every refactor; surviving code motion is the point, so coarser resolution is the accepted cost.
- `matchesGlob` treats its `glob` argument as **untrusted frontmatter content**, not a trusted pattern. `?` was missing from the escape class and reached `new RegExp` bare, so `governs: ?` threw "Nothing to repeat" (security review F-1). The `try/catch` is belt-and-braces: callers up the chain are contracted never to throw, and a pattern that cannot compile matches nothing. See the `frontmatter-values-reach-regex-and-structured-writes-unescaped` landmine.
- Companion: `.claude/skills/memory-index/resolve.mjs:59` (its only consumer), `.claude/skills/memory-index/categories.mjs:1` (source of `CANONICAL`).
