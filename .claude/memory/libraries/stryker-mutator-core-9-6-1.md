---
key: @stryker-mutator/core@9.6.1
category: libraries
scope: [research]
---

- Library: Stryker mutation-testing engine (`@stryker-mutator/core`), exact-pinned devDependency. The mutation-oracle (`-f029`) uses it.
- Role: dev-only, advisory test-quality oracle (`npm run test:mutation -- <module> <testPath>` → `scripts/mutation-oracle.mjs`). Never a runtime dependency; never ships to consumers (AC-007).
- Key API (context7 `/stryker-mutator/stryker-js`, verified 2026-06-05): `testRunner: 'command'` + `commandRunner.command` runs an ARBITRARY test command, so it drives the bare `node --test` suite (no Jest/Mocha/Vitest). **`coverageAnalysis: 'perTest'` is NOT supported by the command runner** (only Mocha/Jasmine/Karma/Jest plugins) → must be `'off'`, so every mutant re-runs the whole configured command; bound cost by scoping `mutate: ['<one file>']` + a command that runs only that module's test. `reporters: ['json']` writes `reports/mutation/mutation.json` (schema: mutation-testing-report-schema; survivors = mutants with `status: 'Survived'`). `--incremental` re-tests only changed mutants.
- Verified-at: b667aa8
- Last-touched: 2026-06-21
- Caveat: install pulls ~27 direct deps; introduces ONE moderate audit finding (`qs` via `typed-rest-client`, Stryker's optional dashboard reporter — unreachable with `reporters:['json']`). The CRITICAL liquidjs finding seen at install time is PRE-EXISTING via `@11ty/eleventy`, not Stryker (backlog `bump-eleventy-fix-liquidjs-critical-rce-vuln-8caf`). Exact-pin required (`9.6.1`, no caret) per `check-files-diff DEVDEP_RANGE_FORBIDDEN` — see convention `devdeps-exact-pinned-and-tests-not-strictly-co-named`. `reports/` + `.stryker-tmp/` are gitignored.
