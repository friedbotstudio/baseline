---
key: node-test-bare-directory-reports-false-single-test-failure
category: landmines
scope: [integrate, tdd, chore]
verified-at: f36b142
last-touched: 2026-07-19
---

- Path: the test invocation itself — `package.json → scripts.test` is `node --test --test-reporter=spec tests/*.test.mjs`.
- Trap: running `node --test tests/` (bare directory, no glob) on this Node build (v25.8.1) throws `MODULE_NOT_FOUND: Cannot find module '<repo>/tests'` and the runner reports it as a **test result**:
  ```
  ✖ tests (140ms)
  ℹ tests 1
  ℹ pass 0
  ℹ fail 1
  ```
  That is indistinguishable at a glance from one genuinely failing test. The tell is `suites 0` alongside `tests 1` — a real run of this repo reports `tests 1807 / suites 552`.
- Why it bites hardest at `integrate`: that phase stamps the **binding** verdict into `.claude/state/last_test_result`, which `verify_pass_guard` reads as truth. A false FAIL there halts the landing and sends the reader hunting a bug that does not exist; worse, "fixing" it could mean editing working code.
- Mitigation: always invoke the suite as `npm test` (or `npm run test:full`), never `node --test <dir>`. If a raw invocation is unavoidable, pass the glob: `node --test tests/*.test.mjs`. Sanity-check any suspicious result against the `suites` count before believing a failure.
- Live instance: hit during `timing-instrument-repair` integrate, 2026-07-19. `node --test tests/` → 1 test / 1 fail; `npm test` on the identical tree → 1807 tests / 1792 pass / 0 fail / 15 skipped, exit 0.
- Family: same class as [[verification-harness-misreports-more-often-than-the-subject-fails]] — the measuring apparatus failing while looking like the subject failed.
