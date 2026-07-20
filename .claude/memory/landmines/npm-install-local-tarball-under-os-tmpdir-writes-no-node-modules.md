---
key: npm-install-local-tarball-under-os-tmpdir-writes-no-node-modules
category: landmines
scope: [scout, spec, tdd, security, integrate]
verified-at: HEAD
last-touched: 2026-05-31
---

- Path: `tests/publish-check.test.mjs` (the `smokeInstallWorks()` probe + the 4 env-gated smoke/orchestrator tests) and `scripts/smoke-tarball.mjs` (phase=install).
- Trap: in this dev sandbox, `npm install <local-tarball> --no-save --prefer-offline` run with cwd under node's `os.tmpdir()` (resolves to `/tmp/claude-502`) **exits 0 but writes NO `node_modules` into the target dir** — npm reports "changed 1 package, audited N" yet the package never materializes. The smoke-tarball test then fails at its "installed CLI missing at .../bin/cli.js" assertion. A registry install (`npm install <name>`) into the SAME tmpdir works, and the local-tarball install works under `/var/folders/...` — so it is specifically local-tarball-install + the sandbox TMPDIR. Spent real time chasing this as a code bug before isolating it to the environment.
- Mitigation: env-gate the smoke/orchestrator tests with a FAITHFUL probe — `smokeInstallWorks()` packs a trivial throwaway package and installs the tgz into an `os.tmpdir()` dir, then asserts `node_modules/<pkg>/package.json` exists; if not, the tests `it(..., { skip: PACK_SKIP }, ...)` rather than fail. A shallow "is npm/tar on PATH" probe is INSUFFICIENT — both are present here yet the install silently no-ops. In a real CI/TMPDIR the probe materializes node_modules and the tests run normally.
