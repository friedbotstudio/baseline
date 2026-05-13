# Security reports — supply-chain-hardening

## supply-chain-hardening-2026-05-13.md

# Security Review — supply-chain-hardening — 2026-05-13

## Summary

**Overall risk: LOW.** The branch is a defensive supply-chain hardening workflow (Tier 1 + 2 + 3) responding to the TanStack npm compromise. The changes ADD defenses (package-integrity checks, executable allowlist, devDep pin discipline, installed-tree hash verify, post-install `--strict` drift detection, hardened `.npmrc` defaults, operator hygiene runbook) and do not introduce new attack surface. No CRITICAL or HIGH findings.

Reviewed files (non-git tree; this workflow's write_set):
- `scripts/check-files-diff.mjs`, `scripts/smoke-tarball.mjs`, `scripts/build-template.sh`
- `src/cli/doctor.js`, `src/cli/install.js`, `bin/cli.js`
- `src/.npmrc.template`, `package.json`
- `docs/runbooks/npm-publish.md`
- Test files were skimmed for execution-as-test-only patterns; they do not ship.

## Findings

### [LOW] `execSync` with static command string in `check-files-diff.mjs`
- **OWASP**: A03 - Injection | **CWE**: CWE-78 (OS Command Injection)
- **File**: `scripts/check-files-diff.mjs:55`
- **Evidence**:
  ```js
  const out = execSync('npm pack --dry-run --json --ignore-scripts', {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  ```
- **Impact**: The command string is a literal — no user input is interpolated, so traditional injection does not apply. `cwd` is `process.cwd()` which an attacker could only influence by controlling the operator's shell. The named risk is theoretical: an attacker who already controls `process.cwd()` already controls the publish operation. The use of `execSync` (string form) rather than `execFileSync` (array form) is mild stylistic risk only.
- **Recommendation**: Optional follow-up — migrate to `execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], ...)` for defense-in-depth. Not a blocker.

### [LOW] Tarball extraction outside dev-repo scope is operator-driven
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-22 (Path Traversal via crafted tarball)
- **File**: `scripts/smoke-tarball.mjs:99` (the `npm install <tarballPath>` step accepts a path from env var `TAMPERED_TARBALL`)
- **Evidence**:
  ```js
  execFileSync('npm', ['install', tarballPath, '--no-save', '--prefer-offline'], { cwd: installDir, ... });
  ```
- **Impact**: `TAMPERED_TARBALL` is operator-controlled (test fixture). A malicious tarball passed via this env could exploit tar-extraction vulnerabilities in `npm install`. In practice, this code path runs only under tests; production callers (`npm run publish:smoke`) do not set this env, so the only consumer is the operator's own test harness. Risk is bounded to "operator runs the smoke against a tarball they themselves constructed."
- **Recommendation**: Document in the script header that `TAMPERED_TARBALL` (and `BROKEN_TARBALL`) are test-only entry points. Already partially documented; no code change required.

### [LOW] `materializeNpmrc` reads from a path computed from `import.meta.url`
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-73 (External Control of File Name or Path)
- **File**: `src/cli/install.js:8-10`
- **Evidence**:
  ```js
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const PACKAGE_ROOT = resolve(__dirname, '../..');
  const NPMRC_TEMPLATE_PATH = join(PACKAGE_ROOT, 'src/.npmrc.template');
  ```
- **Impact**: `__dirname` is derived from where the module file lives — not from user input. An attacker who controls `import.meta.url` is already executing arbitrary code via Node's module loader, which is a precondition far beyond what this code introduces. The `join` uses `path.join` (safe; no `..` injection from user input).
- **Recommendation**: None. Standard ESM pattern; risk is theoretical.

### [LOW] `doctor --strict` exposes full file hashes (sha256) in stdout
- **OWASP**: A09 - Security Logging and Monitoring Failures | **CWE**: CWE-209 (Information Exposure Through Error Messages)
- **File**: `src/cli/doctor.js:111` (the `TAMPERED:` line in `formatReport`)
- **Evidence**:
  ```js
  lines.push(`  TAMPERED: ${entry.path}  shipped=${entry.shipped}  observed=${entry.observed}`);
  ```
- **Impact**: The hashes are sha256 of baseline files. If a baseline file legitimately contains a low-entropy secret (it does not today, and SHOULD NOT — the baseline ships only public templates), the sha256 could enable a brute-force preimage search. Since the baseline is intentionally public and ships under Apache-2.0, exposing hashes of public-content files is not a confidentiality concern.
- **Recommendation**: None. The hashes are by design — operator needs them to investigate post-install drift. Surfaced for completeness.

## Dependencies

**Zero new runtime dependencies introduced** (the project ships with empty `dependencies`).

**devDependencies** in `package.json` were CHANGED from `^`-ranges to exact pins:
- `@11ty/eleventy`: was `^3.1.5` → now `3.1.5`
- `nunjucks`: was `^3.2.4` → now `3.2.4`

This is a hardening change, not a new dependency. Pinning reduces the surface for compromised-version-pulled-on-reinstall scenarios (the TanStack incident's exact mechanism). No CVE check needed for version changes since the resolved version is unchanged from prior `^`-range result (3.1.5 and 3.2.4 are the same versions npm was already installing).

`npm audit` was not run in this review because the project has zero runtime deps and 2 devDeps that are not shipped in the published tarball; audit results on devDeps are operator-machine concerns, not consumer-facing.

## Out of scope / Noted

- **The Pre-publish hygiene sweep runbook (Step 1.5) is operator policy, not enforced code.** Operators who skip the sweep can still publish — the runbook is documentation. Enforcement would require a pre-publish git hook or CI check; the runbook itself flags this as Future-CI work.
- **`min-release-age=7` in the materialized `.npmrc`** is a downstream-consumer hardening (per npm 11.x behavior — refuses to install a registry-published version less than 7 days old). This is a npm-version-dependent feature; consumers on npm < 10.5 will silently ignore the directive. Documented in the runbook.
- **`doctor --strict` requires a `.baseline-manifest.json` on disk.** A pre-install attacker who replaces the manifest with one that matches the tampered files defeats the check. The manifest is byte-identical to the shipped `obj/template/manifest.json` at install time; downstream users can compare against `npm view create-baseline dist.shasum` for a second-channel verification. Out of scope for this workflow; noted for a follow-up Trust-Establishment spec.
- **PoC for the AC-004 tampered tarball test** uses macOS `tar` which emits `._*` AppleDouble metadata files into the repack. The smoke-tarball hash-verify iterates manifest entries (not disk entries), so extra files do not produce false positives. This was a design choice surfaced during implementation.
- **`prepare` script allowlisted value** is hardcoded to `"bash scripts/build-template.sh"`. If the operator legitimately needs to change this string (e.g., refactoring the build script's invocation), they must update both `package.json` AND `scripts/check-files-diff.mjs:PREPARE_ALLOWLISTED`. A future refactor could move both to a shared constants module.
- **Test files are not shipped** (`package.json → files` lists only `bin/`, `src/`, `obj/template/`, `README.md`). Test code that exercises tar extraction, synthetic packages, and tampered tarballs cannot reach consumers.

