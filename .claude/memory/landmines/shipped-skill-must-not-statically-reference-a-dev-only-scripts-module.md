---
key: shipped-skill-must-not-statically-reference-a-dev-only-scripts-module
category: landmines
scope: [chore, integrate]
verified-at: b3f9505
last-touched: 2026-07-15
---

- Path: `.claude/skills/harness/checkers/mutation-score.mjs`; guards at `tests/mutation-oracle.test.mjs` (`test_when_shipped_harness_skill_walked_then_zero_runtime_dev_tree_refs`, `test_when_files_whitelist_and_buildout_then_no_stryker_or_wrapper_shipped`).
- Trap: a checker adapter under `.claude/skills/harness/**` **ships** to consumers (copied into `obj/template/`), but `scripts/` (Stryker + `mutation-oracle.mjs`) does **not** ship. A first cut of the C5 mutation-score adapter statically `import()`ed `../../../../scripts/mutation-oracle.mjs` and named "stryker"/"mutation-oracle.mjs" in comments. Both shipped-refs tests walk `obj/template/` and FAIL on any `stryker|mutation-oracle\.mjs` string OR any `scripts/`/`src/`/`tests/` runtime ref in a shipped skill — even when the reference is a dynamic import gated behind a default-off flag (the test is static-text, not reachability).
- Mitigation: a shipped adapter that needs a dev-only engine takes the engine as an **injected dependency via `ctx`** (here `ctx.oracleRunner`), holds only pure verdict logic, and fail-opens (`{findings:[]}`) when the runner/flag/target is absent. The dev-only runner is wired in by the baseline's own integrate phase (main context), never named in a shipped file. This is the same shape the `spec-shippability-review` C1/C3 checks enforce on spec drafts — the runtime tests enforce it on the built tree.
- Live 2026-07-15 (`non-ui-oracle-c5`, C5): caught by the full suite at the implement-tick (9 C5 tests green in isolation, 2 shipped-refs tests RED in the full run); fixed by runner-injection before landing. Same class as [[baseline-skill-edit-needs-manifest-rebuild]] — editing shipped skills has build-time consequences the per-file view misses.
