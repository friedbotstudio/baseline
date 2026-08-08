---
key: tdd-order-guard-test-stem-must-match-source-stem
category: landmines
scope: [tdd, integrate]
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- Path: `.claude/hooks/tdd_order_guard.sh` (candidate-derivation logic, the Python heredoc starting around line 64)
- Trap: when creating a NEW source file under a path matching `project.json → tdd.source_globs`, the guard generates expected test paths via a fixed template: `tests/<src-stem>.test.<ext>`, `tests/<src-stem>_test.<ext>`, `tests/<src-stem>.spec.<ext>`, plus mirrored-layout variants. A test file whose stem does NOT exactly match the source stem will FAIL the guard with `no test file found for new source 'X'. Candidates were derived from project.json → tdd.test_globs (e.g. ...)`. Caught at the upgrade-version-aware-noop implement step (2026-05-27): scenario worker wrote `tests/project-json-refresh.test.mjs` for `src/cli/project-json.js`; the `-refresh` suffix broke the stem match and the guard refused the Write.
- Mitigation: name tests `tests/<source-stem>.test.<ext>` exactly. For `src/cli/foo.js` → `tests/foo.test.mjs` or `tests/foo.test.js`. Suffixed names like `tests/foo-edge-cases.test.mjs` or `tests/foo-refresh.test.mjs` will fail the guard on the FIRST creation of the source file. After the source exists, the guard skips (only fires on file creation), so suffixed tests can be added later — but the first test file MUST match the stem.
- Real fix (deferred): broaden the candidate-derivation Python to also accept `tests/<src-stem>-<anything>.test.<ext>` patterns. Until then, the convention applies.
