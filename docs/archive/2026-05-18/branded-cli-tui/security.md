# Security reports — branded-cli-tui

## branded-cli-tui-2026-05-18.md

# Security Review — branded-cli-tui — 2026-05-18

## Summary

**Overall risk: LOW.** This diff adds a presentation layer on top of existing pure-data CLI functions and introduces one new runtime dependency (`@clack/prompts@1.4.0`, exact-pinned, 0 known CVEs per `npm audit`). No new HTTP/DB/auth/crypto surface; no shell-outs; no user-controlled paths beyond what the prior CLI already accepted. Three LOW findings filed below — each is defense-in-depth, none blocking.

## Findings

### [LOW] Path traversal hardening in manifest-driven copy/unlink

- **OWASP**: A08 — Software & Data Integrity Failures | **CWE**: CWE-22 (Path Traversal)
- **Files**: `src/cli/merge.js:32-99`, `src/cli/install.js:37-43`
- **Evidence**:
  ```js
  // merge.js — paths from manifest.files become destination paths
  for (const rel of allPaths) {
    const tplPath = join(templateDir, rel);
    const tgtPath = join(target, rel);
    ...
    if (!dryRun) await copyFile(tplPath, tgtPath);
    ...
    if (!dryRun) await unlink(tgtPath);
  }
  ```
- **Impact**: If an attacker can plant or edit `<target>/.claude/.baseline-manifest.json` to contain a key like `../../etc/passwd`, the upgrade flow's `join(target, rel)` will resolve outside `target` and the copy/unlink will hit a path the user did not authorize. The same shape applies to `freshInstall`'s `writeBaselineManifest` step (which trusts paths from `listFiles(target)` — those come from a filesystem walk, so the risk is lower there). Real-world exploitability requires either (a) a tampered manifest in an installed target (attacker already has write access to `.claude/`), or (b) a poisoned template overlay (attacker controls the npm package contents — that's the broader supply-chain attack the baseline already defends against via sha256 manifest pinning). The dummy path-traversal payload is not a current vector but is worth hardening against future scenarios (e.g., installing into a chroot, or a future "merge from two templates" flow).
- **Recommendation**: Add a single defensive guard inside the loop: after computing `tgtPath`, assert `resolve(tgtPath).startsWith(resolve(target) + sep)`. Reject with an `INVALID_PATH` action kind if violated. Same in `src/cli/manifest.js → buildManifestFromDir`. Approximate cost: ~6 lines of code; ~1 unit test.

### [LOW] Single new runtime dependency adds 6 packages to the supply-chain surface

- **OWASP**: A06 — Vulnerable & Outdated Components | **CWE**: CWE-1357 (Reliance on Insufficiently Trustworthy Component)
- **Files**: `package.json:46-48`, `package-lock.json` (61 new lines)
- **Evidence**:
  ```text
  @clack/prompts@1.4.0
    ├── @clack/core@1.3.1
    ├── fast-wrap-ansi@0.2.0
    ├── fast-string-width@3.0.2
    │   └── fast-string-truncated-width@3.0.3
    └── sisteransi@1.0.5
  ```
- **Impact**: Six new packages are now part of every install's runtime closure. The package previously declared `"Zero-dependency"` (this diff retires that claim). `npm audit --omit=dev` reports 0 vulnerabilities at review time. Maintainers are reputable (`bombshell-dev` for clack, `Terkel Gjervig` for sisteransi, same author family for the `fast-*` packages). No `postinstall` / `preinstall` / `install` scripts exist on any of the six — verified by the existing `check-files-diff.mjs → SCRIPT_HOOK_FORBIDDEN` rule (still in force).
- **Recommendation** (defense-in-depth):
  1. Keep the exact-version pin (`"1.4.0"` — no caret). Already in place. ✓
  2. Re-run `npm audit --omit=dev` before each release; fail the release on any new CRITICAL/HIGH finding for these six packages.
  3. Document in `docs/init/seed.md` §16 (or README's supply-chain section) why this dep was added and the constraint on future additions (the DEPS_ALLOWLIST in `scripts/check-files-diff.mjs:99` enforces this technically).

### [LOW] DEPS_ALLOWLIST relaxes the previous "empty dependencies" guarantee

- **OWASP**: A05 — Security Misconfiguration | **CWE**: CWE-1326 (Missing Immutable Root of Trust in Hardware) is not a perfect match; closest is CWE-1188 (Initialization of a Resource with an Insecure Default) but the new allowlist is the intended default, not insecure.
- **Files**: `scripts/check-files-diff.mjs:94-104`
- **Evidence**:
  ```js
  const DEPS_ALLOWLIST = new Set(['@clack/prompts']);

  function checkPackageIntegrity(pkg) {
    const violations = [];
    const deps = pkg.dependencies || {};
    const unsanctioned = Object.keys(deps).filter((name) => !DEPS_ALLOWLIST.has(name));
    if (unsanctioned.length > 0) {
      violations.push(`DEPS_FORBIDDEN: only the allowlist may appear in dependencies; unsanctioned: ${unsanctioned.join(', ')}`);
    }
  ```
- **Impact**: The previous rule was "`dependencies` MUST be empty" — a strict supply-chain guarantee. The new rule allows any package on the explicit allowlist. A future contributor could expand `DEPS_ALLOWLIST` without spec/intake/review, weakening the guarantee silently.
- **Recommendation**: Add a CI/audit assertion (or a test) that pins `DEPS_ALLOWLIST` to its expected contents (`['@clack/prompts']`). Any future addition fails the test until the spec is amended and the test updated in the same PR. Approximate cost: ~10 lines in a new `tests/check-files-diff-allowlist.test.mjs`.

## Dependencies

| Package | Version | Reason | CVE check |
|---|---|---|---|
| `@clack/prompts` | 1.4.0 (exact) | Branded TUI primitives — intro / outro / spinner / select / log / isCancel | npm audit: 0 vulnerabilities (2026-05-18) |
| `@clack/core` | 1.3.1 | Transitive (core prompt primitives) | clean |
| `fast-wrap-ansi` | 0.2.0 | Transitive (ANSI wrapping) | clean |
| `fast-string-width` | 3.0.2 | Transitive (string width measurement) | clean |
| `fast-string-truncated-width` | 3.0.3 | Transitive (truncated-width measurement) | clean |
| `sisteransi` | 1.0.5 | Transitive (ANSI escape sequences) | clean |

`npm audit --omit=dev` exit 0; full closure has 0 advisories at review time. No `postinstall` / `preinstall` / `install` scripts on any of the six (the existing `SCRIPT_HOOK_FORBIDDEN` rule in `check-files-diff.mjs:105-110` continues to enforce this).

## Out of scope / Noted

- **Unrelated pre-existing drift** in `src/CLAUDE.template.md` (test `template-drift.test.mjs` fails on byte-mirror). Tracked in backlog entry `seed-template-md-pre-redesign-drift-a1f3`. Not addressed by this work and not a security concern.
- **`@clack/prompts` non-TTY behavior** — empirically verified during `/tdd` Step 0 that clack emits Unicode framing bytes even to piped stdout. The CLI router was designed to dynamic-`import` clack only inside the `process.stdout.isTTY === true` branch, so CI / piped invocations never load clack. This is correct from a UX standpoint; it also has a small supply-chain side effect (clack's code never executes in CI), but doesn't change the static dependency surface.
- **PlantUML jar fetch** — unchanged. Still pinned to a specific upstream URL with a hardcoded sha256 (`src/cli/plantuml.js:8-10`). Out of scope here; the existing pin is the right defense.
- **`writeBaselineManifest` path source** — `src/cli/install.js:37-43` walks `target/` and stores the relative paths as manifest keys. Filesystem-walked paths can in principle include `..` if the walker follows symlinks. Today's walk uses `readdir` recursion without explicit symlink handling. Worth a follow-up test that simulates a malicious symlink in template and asserts the walk does not escape `target`. Not added to this review's findings because the symlink threat predates this diff; flagging as a candidate `intake` for a future hardening pass.

