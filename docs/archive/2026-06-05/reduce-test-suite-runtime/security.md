# Security reports — reduce-test-suite-runtime

## reduce-test-suite-runtime-2026-06-05.md

# Security Review — reduce-test-suite-runtime — 2026-06-05

## Summary

Overall risk: **LOW**. The change is test-infrastructure + a build-internal audit flag. The one integrity-relevant surface — `audit.mjs --skip-hash-check`, which disables per-file sha256 hash-drift detection — is correctly confined to build-internal use; the standalone audit that backs the `/verify` + `/integrate` verdict and CI keeps full hashing, and a regression test enforces that. No secrets, no new dependencies, no crypto/auth/network surfaces, no injection vectors (all flags are hardcoded literals, not user input).

## Findings

### [LOW] `--skip-hash-check` disables supply-chain hash-drift detection (by design, scoped)
- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-345 (Insufficient Verification of Data Authenticity)
- **File**: `.claude/skills/audit-baseline/audit.mjs:42-48, 294-299`; consumer `scripts/build-template.sh:216-221`
- **Evidence**:
  ```js
  else if (arg === '--skip-hash-check') SKIP_HASH_CHECK = true;
  ...
  if (SKIP_HASH_CHECK) continue; // presence still verified above; re-hash suppressed (build-internal)
  ```
  ```bash
  if ! CLAUDE_PROJECT_DIR="$PKG_ROOT" node "$AUDIT_SCRIPT" --skip-hash-check >&2; then
  ```
- **Impact**: `--skip-hash-check` suppresses the per-file sha256 comparison that detects tampering of baseline-owned shipped files. If the *standalone* verdict audit were ever invoked with this flag, a tampered file would pass undetected.
- **Why LOW**: (1) The flag is a **hardcoded literal** passed only at `build-template.sh:217` (Stage 4), where the manifest was just stamped from the same source in the same run — the re-hash is tautological there. (2) The standalone audit (project `test.cmd`, `/verify`, `/integrate`, CI `publish:check`) runs **without** the flag → full hashing. (3) `tests/build-audit-rehash-skip.test.mjs` asserts the standalone audit (no flag) still FAILs with `hash mismatch` on a tampered manifest-listed file, locking in verdict fidelity. (4) Not attacker-reachable: the flag reads no untrusted input; an actor able to pass it already has full repo/build access. Residual is a misuse footgun, not a vulnerability.
- **Recommendation**: Accept as-is. Optional hardening for a later pass: have `audit.mjs` print a visible `WARN: hash check skipped (build-internal)` line when the flag is set, so a `--skip-hash-check` run can never be mistaken for a full verdict in logs.

### [LOW] Local `PUBLISH_TESTS` gate hides supply-chain checks from the default run
- **OWASP**: A05 - Security Misconfiguration | **CWE**: CWE-1053 (Missing Documentation of a Security-Relevant Control surface)
- **File**: `tests/publish-check.test.mjs:65-72` (`PACK_SKIP` now gated on `PUBLISH_TESTS`); `tests/publish-check.test.mjs:439` (surprise-executable supply-chain case gated)
- **Evidence**:
  ```js
  const PACK_SKIP = !process.env.PUBLISH_TESTS
    ? 'set PUBLISH_TESTS=1 to run the npm-pack/tarball-install publish tier (heavy, on-demand)'
    : (smokeInstallWorks() ? false : '...toolchain unavailable...');
  ```
- **Impact**: A developer running the default `npm test` no longer exercises the packaging supply-chain checks (`check-files-diff` hardening cases that mutate the tree, tarball hash-verify), so a local "green" does not assert packaging integrity.
- **Why LOW**: CI parity is preserved — `.github/workflows/release.yml` runs `npm run publish:check` independently of the node:test suite, and `npm run test:full` runs the gated tier locally. The pure-node `check-files-diff` synthetic-pkg supply-chain tests (optionalDependencies, script-hook allowlist, devDep pin discipline) remain in the **default** tier (they use their own tmpdirs). Only the npm-pack/install-heavy and one live-tree-writing case moved behind the gate.
- **Recommendation**: Accept. Ensure the tier split is documented in CONTRIBUTING/test README so "green locally" is not misread as "publishable" (already noted in the spec Rollout).

## Dependencies

No new packages. `package.json` change is a `scripts.test:full` addition only. `npm pack --ignore-scripts` in the smoke is a **safety improvement** (lifecycle scripts are not executed during the dry-run file-list check). `sha256` usage in `audit.mjs` is unchanged (`node:crypto` createHash).

## Out of scope / Noted

- The reverted Candidate B (build-once) is not in the diff. No security impact.
- `scripts/build-template.sh` machine-global mkdir mutex (`$TMPDIR/create-baseline-build.lock.d`) is pre-existing; a predictable tmp lock path is a theoretical local DoS (a hostile local process could hold the lock), but it pre-dates this change and is out of scope.

