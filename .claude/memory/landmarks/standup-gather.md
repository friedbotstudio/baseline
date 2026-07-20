---
key: .claude/skills/standup/gather.mjs
category: landmarks
scope: [scout]
source: inferred-from-code
verified-at: 1a2cce3
last-touched: 2026-07-20
---

- Role: Domain — the deterministic recap `/standup` reads. Gathers release state (last tag, commits-since classified by conventional-commit type, aggregate semver bump from `.releaserc.json`, pushed-vs-origin), the backlog bucketed open/picked-up/dropped with epic children nested under `parent`, condensed pending questions, and the roadmap epic rollup. Per Article II it gathers only — the "what to pick up next" judgment is main-context's.
- Entry point: `gatherSync({ rootDir, now })` at `:20`. Note the parameter is `rootDir`, not `root`.
- Backlog and questions route through `resolveCategory` from [[.claude/skills/memory-index/lift-fields.mjs]] (`:117`, `:155`), so both store shapes read identically.
- Caveat: `degraded[]` markers mean *the store is absent*, not *the store is empty*. `no-backlog` fired for weeks while 16 shards existed, because the collector read flat `backlog.md` after the T4 migration had sharded it — `/standup` reported an empty backlog to every reader, which reads as "nothing to do". Keep the marker's meaning honest; a reader that cannot find its data must say so rather than returning a confident zero.
