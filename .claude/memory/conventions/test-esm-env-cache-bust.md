---
key: test-esm-env-cache-bust
category: conventions
scope: [scenario, implement, tdd]
source: inferred-from-code
convention: ESM tests that dynamically import a target module under multiple env states MUST cache-bust the import URL by appending a unique query suffix: `pathToFileURL(file).href + '?t=' + Date.now() + '-' + Math.random()`. Node's ESM loader caches modules by URL string; without a unique suffix, the second `import()` returns the first call's evaluation regardless of env changes between calls. Save/restore `process.env.<VAR>` in a try/finally so concurrent test files don't pollute each other.
why: eleventy global data files at `site-src/_data/*.js` read `process.env.GITHUB_RUN_ID` at import time. The same module needs to return `'gha-…'` in one test and `'dev'` in the next; without cache-busting, the second test sees the first test's frozen value.
reference: `tests/site-build-id.test.mjs:39–58` (`importBuildData` helper).
applies-to: any eleventy-data-file test or env-driven ESM module test where the import surface depends on `process.env`.
verified-at: 3c74ba8
last-touched: 2026-06-20
---


