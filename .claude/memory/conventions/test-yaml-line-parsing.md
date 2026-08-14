---
key: test-yaml-line-parsing
category: conventions
scope: [scenario, implement, tdd]
source: inferred-from-code
convention: this repo enforces empty `dependencies` via `scripts/check-files-diff.mjs` (the `DEPS_FORBIDDEN` sub-check), so YAML-invariant tests cannot add `yaml` as a devDependency. Instead, parse `.github/workflows/*.yml` with line-based regex helpers that exploit YAML's indent structure: `topLevelBlock(text, key)` returns the body of a column-0 key (e.g., `on:`, `jobs:`, `concurrency:`); `jobBlock(text, name)` returns the body of a `  <name>:`-indented job under `jobs:`; `subBlock(blockText, subKey)` returns the body of an inner `    <key>:`-indented section (e.g., `permissions:`, `steps:`); `parsePermissions(blockText)` turns a permissions sub-block into a flat `{key: value}` map for `assert.deepEqual` checks; `usesDirectives(text)` returns every `uses:` line's value verbatim for SHA-pin assertions; `inputBlock(onBlockText, inputName)` returns the body of an `      <name>:`-indented input under `workflow_dispatch.inputs:`.
why: the project's tarball-shape contract (`check-files-diff.mjs → DEVDEP_RANGE_FORBIDDEN`, `DEVDEP_NON_REGISTRY`) blocks loose devDep additions, and the runtime `dependencies` array is asserted empty. Importing a yaml parser would break either invariant or push churn.
placement: helpers live ~10 lines each inside the test file that needs them. Do not extract a shared YAML utility module just for one or two test suites; DRY emerges from structure, not from premature extraction.
reference: `tests/release-workflow.test.mjs:30–87` (the 6 helpers).
applies-to: any test asserting on `.github/workflows/*.yml` shape or other project-controlled YAML.
verified-at: 8201af6
last-touched: 2026-08-14
---


