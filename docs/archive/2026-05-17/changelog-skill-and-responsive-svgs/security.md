# Security reports — changelog-skill-and-responsive-svgs

## changelog-skill-and-responsive-svgs-2026-05-18.md

# Security Review — changelog-skill-and-responsive-svgs — 2026-05-18

## Summary

**Overall risk: LOW.** The branch introduces a new Phase 11.5 changelog skill (Node ESM actuator + 4 helpers + 7 tests), a build-pipeline reorder, constitution edits, and an inline-SVG redesign. No CRITICAL, HIGH, or MEDIUM findings. Three LOW findings (path-handling discipline, exec-argv hygiene, semver parsing robustness) and two INFO observations (supply chain + RMW race) — all bounded by the operator-trust model (developer-on-laptop). No new HTTP surfaces, no new auth paths, no new cryptography.

## Findings

### [LOW] Path traversal via `--slug` argument

- **OWASP**: A01 Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/changelog/state-writer.mjs:11`
- **Evidence**:
  ```js
  export async function writeState(projectRoot, slug, state) {
    const dir = join(projectRoot, '.claude/state/changelog');
    const path = join(dir, `${slug}.json`);
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
  ```
- **Impact**: A slug containing `../` segments (e.g., `--slug "../../etc/passwd-clog"`) lets `join()` resolve outside `.claude/state/changelog/`. The file content is JSON serialization of the actuator's state object, so an attacker who controls the slug could write a JSON file into arbitrary project paths. The slug originates from `workflow.json → slug` which `/triage` writes; in practice the only attacker who can control it is the developer who already has write access to the project. Same threat model as the prior `drift_check.py --slug` finding in `docs/archive/2026-05-17/workflow-loop-closing-hygiene/security.md` (LOW, non-blocking).
- **Recommendation**: At `state-writer.mjs` entry, validate slug against `^[a-z0-9-]+$` (the canonical-slug pattern from `lib/common.sh → canonical_slug`); reject with exit 2 + clear error on mismatch. Non-blocking; carry as a future hardening tick alongside the drift_check carve-out.

### [LOW] git tag content used in range argument

- **OWASP**: A03 Injection | **CWE**: CWE-78 (OS Command Injection — bounded)
- **File**: `.claude/skills/changelog/version-preview.mjs:32`
- **Evidence**:
  ```js
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  raw = execFileSync('git', ['log', range, '--format=%H%x09%s%x09%b%x00'], {
    cwd, encoding: 'utf8',
  });
  ```
- **Impact**: `lastTag` is read from `git describe --tags --abbrev=0` output. A malicious git tag (e.g., a tag whose name contains backticks or `$()` substitutions) is interpolated into the range string. Mitigated because `execFileSync` does NOT invoke a shell — argv elements are passed verbatim to git, which treats them as a single revision spec. Worst case: git rejects the range and returns empty commits. No shell escape is possible at this site. Risk would jump to HIGH if someone refactored to `execSync` (which DOES invoke a shell).
- **Recommendation**: Add an invariant comment above the call: `// execFileSync chosen deliberately — DO NOT switch to execSync; lastTag is untrusted content.` Optionally, validate tag against `^[a-zA-Z0-9._/-]+$` before interpolation. Non-blocking.

### [LOW] Semver parsing of git tag is non-defensive

- **OWASP**: A04 Insecure Design (data validation gap) | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/skills/changelog/version-preview.mjs:74-94` (`localProjection` fallback)
- **Evidence**:
  ```js
  const baseSemver = lastTag.replace(/^v/, '');
  const baseParts = baseSemver.split('.').map((s) => parseInt(s, 10) || 0);
  // ...
  const [maj, min, pat] = baseParts;
  if (bumpType === 'major') return { version: `${maj + 1}.0.0`, type: 'major' };
  ```
- **Impact**: If the most recent git tag is not a clean semver (e.g., `v1.0-beta.1+build.42`), `baseSemver.split('.')` returns extra parts; `[maj, min, pat]` discards them but the projected version may still be wrong (`maj` parses to `1`, `min` parses to `0` from `0-beta`, `pat` parses to `1` from `1+build` — silently incorrect output). The exploit path is "developer pushes a tag with format outside the conventional pattern; the projection lies to them." Not a security vulnerability per se; closer to data-integrity.
- **Recommendation**: After `parseInt`, validate `[maj, min, pat]` are all numeric AND that `baseParts.length === 3`; on mismatch return `{version: null, type: null}` and let the caller fall back to "unknown projection." Non-blocking; tracked as a quality polish item.

## Dependencies

**No new packages introduced by this branch.** The actuator imports `semantic-release` (already pinned in `package.json` as `devDependencies`, version per the lockfile). Dynamic import via `await import('semantic-release')` — same module that the existing CI pipeline already audits via `npm audit signatures`.

The `@semantic-release/changelog@6.0.3` plugin reference in `AC-013` test is also a pre-existing devDep, unchanged.

## Out of scope / Noted

- **[INFO] devDep supply chain**: `semantic-release` ships a substantial transitive dep tree. Mitigated by the existing release-pipeline gate (`scripts/verify-action-shas.mjs` + `npm audit signatures`). No action needed in this workflow.
- **[INFO] CHANGELOG.md RMW race**: `unreleased-writer.mjs` performs read-modify-write on `CHANGELOG.md`. Theoretically vulnerable to a concurrent writer (e.g., two developers running `/commit` simultaneously). Mitigated by the workflow contract: `/commit` runs serially on a single developer's branch, and the consent token ensures only one in-flight commit per 5-minute window. Not exploitable in practice; carry as a known design assumption.
- **[INFO] Site-src bento SVG**: Inline SVG in `site-src/index.njk` rendered to static HTML at build time via Eleventy/Nunjucks. No runtime injection surface (no `{{ user_input | safe }}` in the SVG); the SVG content is project-controlled markup. No XSS risk.
- **[INFO] CHANGELOG.md migration is one-time content rewrite**: The migration changes `# [version]` to `## [version]` and inserts `## [Unreleased]` at top. No code, no secrets. Audit confirms no API keys or tokens in the rewritten file.
- **[INFO] `scripts/build-template.sh` reorder**: The audit step moved from FIRST to LAST in the build script. No new commands introduced; only ordering changed. Audit still gates the build (just runs after the manifest is fresh — closing a chicken-and-egg loop on baseline-owned SKILL.md edits).
- **[INFO] Site-src `@media (max-width: 768px)` block**: No selector specificity attacks possible (CSS only, no JS). Bento layout's CSS custom properties are project-controlled — no path for user input to flow into stylesheets.

## Verdict

**APPROVED for merge** — only LOW findings, all bounded by operator-trust model + execFileSync's no-shell-invocation property + the workflow contract's serial-commit guarantee. The three LOW items carry forward as future hardening tickets (a `slug-validation` and `argv-discipline` carve-out chore would address them in one pass alongside the existing `drift_check.py --slug` finding).

No CRITICAL/HIGH/MEDIUM findings → security phase marks `completed`.

