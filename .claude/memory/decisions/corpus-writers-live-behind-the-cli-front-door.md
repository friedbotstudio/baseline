---
key: corpus-writers-live-behind-the-cli-front-door
category: decisions
scope: [spec, implement, simplify]
governs: .claude/skills/workspace/cli.mjs, .claude/skills/workspace/queries.mjs
verified-at: 79e41cb
last-touched: 2026-08-13
---

- Decision: **a new corpus writer lands as a `workspace` subcommand, never as a per-module entry point with its own `main` guard.**
- Rationale, in `cli.mjs`'s own words about the writers already there: they "sit beside the reads rather than in a separate dispatcher because they answer about the same corpus; what separates them is the W-1..W-5 contract they run through, not their address."

**Measured 2026-08-13.** The `restore-degraded-shards` spec pinned a standalone `node .claude/skills/workspace/restore-degraded-shards.mjs [--dry-run]` in its Contracts table. `/integrate` ruled both the absence and the address wrong, and the subcommand shipped instead.

**The payoff was mechanical, not aesthetic.** Adding one row to `WRITE_PATHS` in `tests/cli-writer-contract.test.mjs` put the new writer under the shared contract, and **two existing table-driven tests went red on their own** — W-2 (the flag gate precedes the write) and W-3 (one invocation writes one thing). Neither was written for this subcommand. A standalone entry point would have inherited nothing and needed both re-implemented by hand, which is how the fifth of five write paths ends up being the weak one.

- **Corollary:** give the function a `specDir` parameter so `--spec-dir` is honoured rather than silently ignored. That is what lets the shared table drive it at all; a writer that quietly ignores a flag cannot be tested by a table that passes it.
- **Corollary:** when the exit status IS the verdict (a repair reporting damage nobody can fix), return `exitCode` from the handler rather than throwing. `dispatch` documents that seam — "a successful run that reports bad news, not an error" — and the body still prints.
- Do not read this as "writes belong in the reads dispatcher generally". The rule is narrower: writers that answer about the SAME subject as the reads share their address. `materialize` still has no subcommand only because the dispatcher sweep has not reached it.
