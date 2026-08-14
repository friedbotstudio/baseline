---
key: node:test@node-25.8.1
category: libraries
scope: [research]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Library: Node.js built-in test runner (`node --test`), runtime `node@25.8.1` (engines `>=18.17.0`).
- Role: the project test runner (`npm test` = `node --test --test-reporter=spec tests/*.test.mjs`). API facts verified via context7 `/nodejs/node/v25.9.0` during the reduce-test-suite-runtime workflow.
- Key API: **`--test-concurrency`** defaults to `os.availableParallelism() - 1` when isolation is `process` (the default) — so the CLI suite ALREADY runs test FILES in parallel with no flag; a serial run needs explicit `--test-concurrency=1`. **`--test-isolation=process`** (default) runs each test FILE in its own child process — an in-process module-level cache (e.g. a memoized build promise) does NOT cross files; cross-file sharing needs `--test-global-setup` or a known on-disk fixture path. **`--test-global-setup=<module>`** runs an exported `globalSetup`/`globalTeardown` ONCE before/after all files (throw in globalSetup → no tests run, non-zero exit). Env set in globalSetup does not reliably propagate to isolated child processes — share via a fixed fixture PATH, not env.
- Caveat: `--test-global-setup` build-once was attempted (Candidate B) and reverted — see backlog `reduce-test-suite-wall-clock-blocked-on-global-build-mutex`. It regressed badly because `scripts/build-template.sh` holds a machine-global mkdir mutex (`$TMPDIR/create-baseline-build.lock.d`) that serializes ALL builds; build-once only pays off once that mutex is per-PKG_ROOT or a build-free shared fixture is used. The default-parallel run is intermittently flaky ONLY when a test WRITES the live `obj/template` (npm pack → prepack); gate or `--ignore-scripts` those writers and parallel is deterministic (see landmine `live-objtemplate-rebuild-races-parallel-test-readers`).
