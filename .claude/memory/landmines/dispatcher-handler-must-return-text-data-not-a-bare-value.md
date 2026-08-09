---
key: dispatcher-handler-must-return-text-data-not-a-bare-value
category: landmines
scope: [tdd, implement, simplify]
governs: .claude/skills/lib/output.mjs, .claude/skills/lib/argv.mjs, .claude/skills/standup/cli.mjs, .claude/skills/spec/cli.mjs
source: incident
verified-at: dd0e5d2
last-touched: 2026-08-09
---

- Path: any new skill dispatcher subcommand handler, wired through `dispatch()` in `.claude/skills/lib/argv.mjs`.
- Trap: `emit(result, json)` reads `result.data` under `--json` and `result.text` otherwise (`.claude/skills/lib/output.mjs:38-44`). A handler that returns the payload **directly** — `return collected` rather than `return { data: collected }` — hits `result.data ?? null` and prints the literal `null`. Exit code is **0**, stderr is empty, and the command looks like it worked.
- Cost when missed: the failure is silent in exactly the mode a caller is most likely to script against. Observed 2026-08-08 writing `standup/cli.mjs`: `recap --json` printed `null` and only a direct run caught it, because the test asserted on parsed keys rather than on exit status.
- Mitigation: return `{ data, text }` from every handler. Return both even when one mode seems unlikely — `emit` picks per-invocation, so a handler supplying only `text` prints `null` to any `--json` caller, and one supplying only `data` prints nothing at all in human mode.
- Related: `.claude/skills/lib/argv.mjs` also declares the value-taking flag union; see landmark `.claude/skills/lib/argv.mjs` for the separate `--flag` -without-value hazard.
