---
key: cli-mjs-invoked-bare-uses-config-defaults-unless-it-reads-project-json
category: landmines
scope: [harness, tdd, integrate]
verified-at: faa3ca9
last-touched: 2026-07-23
---

- **Trap.** A `.mjs` helper whose config arrives via an injected dep (the test-only path) will silently fall back to **hardcoded defaults** when run as a bare CLI, because the CLI entrypoint passes no deps. Any behavior that depends on `project.json` values is then **inert in production** while every unit test passes — the tests inject the config the CLI never loads.
- **Live near-miss (`rightsize-gate-fix`, 2026-07-23).** `.claude/skills/harness/rightsize-gate.mjs → main` did `configFromProject(deps.project)`; in the harness CLI invocation (`rightsize-gate.mjs check --slug <s>`) `deps.project` is `undefined`, so `configFromProject(undefined)` returned all defaults including `test_globs: []`. The whole point of the fix (exclude test-glob rows, D1) therefore did nothing in the real run — caught only by an **observability run** of the live CLI showing `tests/…test.mjs` still in `measured.touched`, not by the (green) unit suite. Fix: `configFromProject(deps.project ?? readProject(rootDir))`, where `readProject` reads `<rootDir>/.claude/project.json` with a `try/catch → {}` fail-open. Same pattern already used for `readWorkflow`.
- **Rule when writing or reviewing a config-driven harness helper:** the CLI/main path MUST load `project.json` (and any other on-disk config) **itself** — never rely on `deps.project` being present outside tests. Add a `readProject(rootDir)` disk-read with a `{}` fail-open fallback so an absent/malformed file degrades to defaults rather than crashing.
- **Detection:** if a unit suite is green but a config-driven feature does nothing live, run the actual CLI once and inspect its output (here: `measured.touched`/`measured.lines`) before trusting the tests. A green isolated-unit test that injects config proves the *logic*, not the *wiring*. See the family entry [[rightsize-gate-measures-whole-dirty-tree-not-workflow-diff]] (the instrument-measuring-the-wrong-thing class).
