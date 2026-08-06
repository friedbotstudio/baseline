# Security reports — audit-flake-writer-isolation

## audit-flake-writer-isolation-2026-08-06.md

# Security Review — main (audit-flake-writer-isolation) — 2026-08-06

## Summary

Overall risk: **LOW**. The diff is 290 insertions / 220 deletions across 18 files, of which 17 are dev-tier test files or test helpers and one is a single string literal in a shipped audit check. No new dependencies, no network surface, no authN/authZ, no crypto, no user-supplied input at any runtime trust boundary. Two LOW findings, both the same class: a caller-supplied `label` is interpolated into a filesystem path without the REJECT-not-repair guard this repo already applies elsewhere (CWE-22). Neither is reachable by an attacker today — every call site passes a hardcoded literal, and `tests/` is not in the published package — but the guard is one line and the precedent is established in-tree.

## What was checked

- `git diff` + the two untracked files, file by file, for OWASP A01–A10.
- Every path construction in the two new helpers (`tests/helpers/audit-repo.mjs`, the extended `tests/helpers/site-build.mjs`).
- Every dynamically constructed `RegExp` in the widened detector (`tests/no-live-objtemplate-reads.test.mjs`).
- Subprocess spawning: argv construction, `shell` usage, env propagation.
- Secrets hygiene across the diff (hardcoded tokens/keys, `.env` reads, log payload contents).
- `npm audit --omit=dev` → **0 vulnerabilities**. No package added or changed.
- `semgrep` / `bandit` / `gosec` are not installed in this environment; per the skill's constraint no tool was installed.

## Findings

### [LOW] `label` is interpolated into a log path without a traversal guard

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `tests/helpers/audit-repo.mjs:31`
- **Evidence**:
  ```js
  function writeCaptureLog({ label, logDir, command, args, cwd, result }) {
    const logPath = join(logDir, `audit-failure-${label}.log`);
    mkdirSync(logDir, { recursive: true });
    writeFileSync(logPath, [...].join('\n'));
    return logPath;
  }
  ```
- **Impact**: A `label` containing `../` escapes `logDir` and writes an attacker-chosen path with attacker-influenced content (the captured stdout/stderr). Reachability today is nil: all eight call sites pass a hardcoded string literal, the helper lives under `tests/` which `package.json → files` does not publish, and it runs only under `npm test`. The exposure is a future caller deriving the label from a variable.
- **Recommendation**: Call `assertSafeSlug(label, 'audit label')` from `.claude/hooks/lib/slug.mjs:37` at `runRepoAudit`'s entry, before any path is constructed — the same REJECT-never-repair placement `plan-store.planPath` and `checker-fanout.runCheckerFanout` already use. Do not normalize the label; a malformed label is an error, not something to repair.

### [LOW] `label` is interpolated into an mkdtemp prefix without a traversal guard

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `tests/helpers/site-build.mjs:48`
- **Evidence**:
  ```js
  export function buildSiteIsolated(label, envOverride = {}) {
    const outDir = mkdtempSync(path.join(tmpdir(), `site-${label}-`));
  ```
- **Impact**: Same class as the finding above, one rung lower — `mkdtempSync` creates a directory, and a `../`-bearing label places it outside `tmpdir()`. It cannot overwrite an existing path (`mkdtemp` always creates a fresh suffixed directory), so the worst case is directory litter in an unintended location, not clobbering. All four call sites pass literals.
- **Recommendation**: Same guard, same placement. One shared validation at both helpers' entry points closes the class.

## Dependencies

No package added, removed, or version-changed in this diff. `npm audit --omit=dev`: 0 vulnerabilities.

## Out of scope / Noted

- **Capture-log contents are not sensitive.** `audit-failure-<label>.log` records the audit's stdout/stderr, which is a table of check names, statuses and repo-relative paths — no credentials, no environment dump. The file lands under `.claude/state/logs/`, which is gitignored, so it cannot be committed by accident. Explicitly checked because writing subprocess output to disk is the shape that usually leaks secrets.
- **`envOverride` reaches `spawnSync`'s `env` (`tests/helpers/site-build.mjs:38-46`).** Callers can set or delete arbitrary variables for the child build. This is the intended contract (GA4's set/unset states) and every caller passes a literal object; no value is read from the environment or from a file. `shell` is not enabled anywhere in the diff and every subprocess uses argv-array form, so there is no command-injection surface.
- **Dynamic `RegExp` construction in the widened detector (`tests/no-live-objtemplate-reads.test.mjs:60-70`)** interpolates an identifier captured by `[A-Za-z_$][\w$]*`, which cannot contain regex metacharacters — no injection. The `[^;\n]*` and `[^)]*` spans are single-quantifier and linear; on a non-matching line they backtrack O(n) per start position, giving a theoretical O(n²) on a pathological single-line file. Input is repo-controlled test source read at test time, so this is noted, not a finding.
- **Prior open backlog item, unchanged by this diff**: `commit-consent-token-is-never-consumed-after-use` (OWASP A01 / CWE-613) remains open. It is untouched here and is not a regression of this landing.

