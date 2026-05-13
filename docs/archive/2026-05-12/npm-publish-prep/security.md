# Security reports — npm-publish-prep

## npm-publish-prep-2026-05-13.md

# Security Review — npm-publish-prep — 2026-05-13

## Summary

**Risk: LOW.** This change adds 3 scripts (1 bash + 2 node) and 1 markdown runbook, plus 4 npm script entries. All subprocess invocations use fixed argv arrays (no shell interpolation of user input), the scripts run in the maintainer's local environment only (no network exposure beyond what `npm pack`/`npm publish` already do), and no secrets or credentials are introduced. Zero new dependencies. `npm audit --omit=dev` reports zero vulnerabilities (verified earlier this session).

## Method

1. **Diff enumeration**: `scripts/publish-check.sh`, `scripts/check-files-diff.mjs`, `scripts/smoke-tarball.mjs`, `tests/publish-check.test.mjs`, `tests/check-files-diff.test.mjs`, `tests/smoke-tarball.test.mjs`, `docs/runbooks/npm-publish.md`, `package.json` (4 added scripts).
2. **Trust boundaries**: scripts run only in the maintainer's local shell during `npm run publish:check` — no HTTP listener, no untrusted input source. The `BROKEN_TARBALL` env var is a test-fixture override that a hostile caller could redirect, but the test runner only invokes it with fixtures it constructed.
3. **OWASP Top 10** walk:
   - A01–A02: no auth surface, no crypto handling.
   - A03 (Injection): all subprocess calls use `execFileSync(<cmd>, [args])` or `spawnSync('node', [...])` with fixed argv — no shell interpolation of variable input.
   - A04 (Insecure Design): the `PUBLISH_CHECK_SIMULATE_FAIL` env hook lets a caller skip a step — but this is a test hook, scoped to the orchestrator, and surfaces visibly in stderr.
   - A05 (Misconfiguration): no config files added beyond `package.json` scripts.
   - A06 (Vulnerable deps): zero new deps.
   - A07–A10: not applicable.

## Findings

*(none in Critical / High / Medium tiers.)*

### [LOW] `BROKEN_TARBALL` env var path is dereferenced without validation

- **OWASP**: A04 - Insecure Design
- **CWE**: CWE-73 (external control of file/path) — low severity, only reachable via local env manipulation
- **File**: `scripts/smoke-tarball.mjs:25-29`
- **Evidence**:
  ```js
  if (brokenTarball) {
    log(`phase=pack source=BROKEN_TARBALL=${brokenTarball}`);
    tarballPath = brokenTarball;
  }
  ```
- **Impact**: An operator with shell access could set `BROKEN_TARBALL=/path/to/anything.tgz` and `smoke-tarball.mjs` would attempt to `npm install` it. Since this requires local shell access, it's not a privilege boundary crossing — the operator already has the same rights as the smoke script.
- **Recommendation**: No action required. The env hook exists specifically for testing and only the operator's own test fixtures populate it.

### [LOW] `scripts/publish-check.sh` disables `errexit` (`set -uo pipefail` not `-euo`)

- **OWASP**: A04 - Insecure Design (defensive programming)
- **CWE**: n/a
- **File**: `scripts/publish-check.sh:19`
- **Evidence**:
  ```bash
  set -uo pipefail
  ```
- **Impact**: Without `-e`, a typo in a step's command would silently succeed. The `run_step` wrapper compensates by explicitly checking exit codes (`"$@" || exit $?`), but the contract is more fragile than `set -euo pipefail` + explicit trap.
- **Recommendation**: Considered acceptable since `run_step` provides the exit-on-failure semantics. A future hardening pass could switch to `-euo` and restructure `run_step` to use `||true` where needed, but the current design is intentional (the trap on EXIT needs `$?` from the failing step, and `set -e` would exit before the trap sees the per-step `LAST_STEP` value in some shells).

## Dependencies

No new packages added.

## Out of scope / Noted

- The `npm publish --dry-run` precheck step writes to no files but does communicate with the npm registry (to validate the publish would succeed). On a maintainer's network this is normal; on an air-gapped environment the precheck would fail with a clear error.
- The smoke test creates and cleans up `mktemp -d` workspaces. On crash, the `process.on('exit')` handler attempts `rm -rf` cleanup; if the process is `kill -9`'d, the workspaces persist (operator can clean `os.tmpdir()/smoke-*` manually). This is consistent with `tests/cli.test.mjs` and `tests/install.test.mjs` conventions.
- A future workflow could add provenance / signed publish via `npm publish --provenance` + OIDC — out of scope until CI exists per intake non-goals.

