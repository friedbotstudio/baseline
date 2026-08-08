---
key: .claude/skills/lib/argv.mjs
category: landmarks
scope: []
governs: .claude/skills/lib/argv.mjs, .claude/skills/lib/output.mjs, .claude/skills/workspace/cli.mjs, .claude/skills/memory-flush/cli.mjs, .claude/skills/system-reconcile/cli.mjs, .claude/skills/memory-index/cli.mjs, .claude/skills/commit/cli.mjs, .claude/skills/document/cli.mjs, .claude/skills/harness/cli.mjs
load_bearing: true
verified-at: 9179afd
last-touched: 2026-08-09
---

- Path: `.claude/skills/lib/argv.mjs`. Foundation — the argv layer every skill dispatcher shares. Second module in `skills/lib/`, after `probe.mjs`, which is the precedent for a shared non-skill helper directory.
- Role: exports `parse(argv)` → `{subcommand, positional, flags, json}`, `dispatch({name, subcommands})`, `lines`, `requireValue`, `refuseBulk`, the `UsageError` / `NotFoundError` classes, and the exit constants (`0` ok, `1` usage-or-validation, `2` not-found). `renderUsage` is **re-exported** from `output.mjs`, not defined here.
- **The flag vocabulary is declared here on purpose, and that is the non-obvious part.** Under `parseArgs({strict: false})` an *undeclared* `--hops 2` parses as `hops: true` and silently drops `2` into positionals. Verified 2026-08-08 on node v25.8.1. So `VALUE_FLAGS` names the union (`root`, `spec-dir`, `hops`, `jar`, `key`, `disposition`, `state`, `governs`, plus `slug`, `kind`, `mem-dir`, `surface`, `delegate`, `touched`, `label` from the dispatcher sweep); adding a value-taking flag to any dispatcher means adding it HERE or the value vanishes with no error.
- **Declaring the flag is only half the hazard.** `--slug` with no value behind it parses as the boolean `true`, not as missing, so a handler validating `flags.slug` validates `true` and the user gets a type error three frames down. `requireValue(flags, name)` is the correction, sited beside the parser because the failure is a property of the parser.
- **It owns argv and nothing else.** Path validation belongs to the skill that owns the path — each dispatcher imports its own `assertNoTraversal` from `workspace/tree.mjs`. A Foundation module reaching into a sibling skill to validate would invert the layer model. Rendering is the same boundary in the other direction: it lives in [[claude-skills-lib-output-mjs]].
- `dispatch` is **async and awaits the handler** — see [[claude-skills-harness-cli-mjs]] for the build-mirror constraint that forced it.
- Related: [[claude-skills-workspace-queries-mjs]] holds the corpus queries the workspace dispatcher wires.
