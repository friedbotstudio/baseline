---
key: .claude/skills/lib/argv.mjs
category: landmarks
scope: []
governs: .claude/skills/lib/argv.mjs, .claude/skills/workspace/cli.mjs, .claude/skills/memory-flush/cli.mjs, .claude/skills/system-reconcile/cli.mjs, .claude/skills/memory-index/cli.mjs
load_bearing: true
verified-at: b164ae7
last-touched: 2026-08-08
---

- Path: `.claude/skills/lib/argv.mjs`. Foundation — the argv layer every skill dispatcher shares. Second module in `skills/lib/`, after `probe.mjs`, which is the precedent for a shared non-skill helper directory.
- Role: exports `parse(argv)` → `{subcommand, positional, flags, json}`, `dispatch({name, subcommands})`, `renderUsage`, `lines`, the `UsageError` / `NotFoundError` classes, and the exit constants (`0` ok, `1` usage-or-validation, `2` not-found).
- **The flag vocabulary is declared here on purpose, and that is the non-obvious part.** Under `parseArgs({strict: false})` an *undeclared* `--hops 2` parses as `hops: true` and silently drops `2` into positionals. Verified 2026-08-08 on node v25.8.1. So `VALUE_FLAGS` names the union (`root`, `spec-dir`, `hops`, `jar`, `key`, `disposition`, `state`, `governs`); adding a value-taking flag to any dispatcher means adding it HERE or the value vanishes with no error.
- **It owns argv and nothing else.** Path validation belongs to the skill that owns the path — each dispatcher imports its own `assertNoTraversal` from `workspace/tree.mjs`. A Foundation module reaching into a sibling skill to validate would invert the layer model.
- `emit()` writes `result.text` verbatim with no trailing newline added, because `view` returns a composed PlantUML document whose bytes a test compares against `composeView` directly.
- Related: [[claude-skills-workspace-queries-mjs]] holds the corpus queries the workspace dispatcher wires.
