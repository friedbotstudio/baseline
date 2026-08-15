---
key: a-hand-rolled-cli-parser-fails-the-same-runnable-contract
category: landmines
load_bearing: true
scope: [implement, tdd, simplify]
governs: .claude/skills/**/cli.mjs, .claude/skills/lib/**
verified-at: 18204a1
last-touched: 2026-08-15
---

- **The trap.** A shared CLI dispatcher already exists at `.claude/skills/lib/argv.mjs` (`dispatch` at :112, `lines` at :57), and **every** skill CLI in the repo routes through it. A new `cli.mjs` with a hand-rolled `parseArgs` looks fine, runs fine by hand, and then fails `probeRunnable` — because the probe asserts the dispatcher's contract, not merely that the file executes.
- **What the hand-rolled version silently gives up**, beyond the failing probe: `--json` output, the usage-error exit contract, and the subcommand help text. All three come free from `await dispatch({ name, subcommands })`.
- **The root cause is not ignorance of the helper, it is not looking.** This cycle wrote `roadmap-sync/cli.mjs` with a bespoke parser while nine sibling CLIs one directory over used the dispatcher. Grep `from '../lib/argv.mjs'` before writing any new `cli.mjs`.
- **Reuse-before-create is a `code-structure` rule and this is its most-repeated instance in the CLI layer.** The layering pass will not catch it: a hand-rolled parser is well-layered, just duplicated.
- Related: [[a-contracts-name-cell-shaped-like-a-path-is-probed-as-an-entry-point]] — the spec-side half of the same probe. Both surface only at drift time, at the end of `/tdd`.
