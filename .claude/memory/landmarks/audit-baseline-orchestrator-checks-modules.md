---
key: .claude/skills/audit-baseline/audit.mjs
category: landmarks
scope: [scout, chore, tdd]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: `audit-baseline` entrypoint, now a **thin orchestrator** (~74 lines). Parses args (`--file=`, `--skip-hash-check`), builds the shared audit context in `checks/context.mjs`, runs one check module per concern from `checks/*.mjs`, and prints the PASS/FAIL/WARN table (guarded by `IS_MAIN` so a test import runs the checks read-only without printing/exiting).
- Structure: each `checks/<concern>.mjs` exports `run(ctx)` returning `[name, status, detail]` rows; the orchestrator's `CHECKS` array fixes their order. `checks/context.mjs → buildContext({root, skipHashCheck})` is the one place disk state (io helpers, EXPECTED_* rosters, on-disk inventory, flags) is read into a frozen ctx. Pure surface helpers (`checkSurfaceCount`/`checkByCategorySum`/`sectionSlice`/`checkDocsiteTracks`/`checkDocsiteHookTable`) live in `checks/surface-helpers.mjs`; `checkConfigParity`/`CONFIG_PARITY_ALLOWLIST` in `config-parity.mjs`. `audit.mjs` re-exports all seven for the governance suite's import paths.
- To add a check: write `checks/<concern>.mjs` exporting `run(ctx)`, list it in `CHECKS`. EXPECTED_* name sets live in `expected-baseline.mjs` (not audit.mjs).
- Caveat: split from an 889-line monolith in epic3-template-gap; the refactor is behavior-preserving — its output is byte-identical to the pre-split audit (verified against a golden capture). Editing any file under this baseline-owned skill drifts its manifest hash; run `npm run manifest:refresh` before the audit's skill-ownership check passes.
