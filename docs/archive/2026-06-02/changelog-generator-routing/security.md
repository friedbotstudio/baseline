# Security reports — changelog-generator-routing

## changelog-generator-routing-2026-06-02.md

# Security Review — feat/whatsnew-generator-routing — 2026-06-02

## Summary

LOW–MEDIUM overall. The change is a dev-tooling refactor (skill rename + generator + config knob) with no network, auth, or crypto surface. One MEDIUM defense-in-depth finding: `fragment-writer.mjs` builds a filesystem path from an unvalidated `slug`, inconsistent with the repo's established slug-validation convention (`seed-tasklist.mjs`, the open-questions consolidator). The removal of the old changelog actuator's `commit_consent`/TTL logic introduces no consent bypass — the generator is intentionally no longer commit-gated and writes only a gitignored fragment.

## Findings

### [MEDIUM — RESOLVED in-branch] Unvalidated slug used in fragment output path (path traversal)
> Resolution: `fragment-writer.mjs` now validates `slug` against `^[a-z0-9][a-z0-9-]*$` (`requireSafeSlug`) before building the path; a traversal slug throws. Covered by `tests/whatsnew-fragment-writer.test.mjs → test_when_slug_has_path_traversal_then_rejected`.

- **OWASP**: A03 - Injection | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/whatsnew/fragment-writer.mjs:55` (and the `--slug` entry at `.claude/skills/whatsnew/whatsnew.mjs:23`)
- **Evidence**:
  ```js
  function fragmentPath(repoRoot, slug) {
    return join(repoRoot, '.claude/state/whatsnew', `${slug}.json`);
  }
  ```
- **Impact**: A crafted `slug` such as `../../escape` would write the fragment outside `.claude/state/whatsnew/`. The slug is normally supplied by the harness (already validated by `seed-tasklist.mjs` against `^[a-z0-9][a-z0-9-]*$` at triage time), so exploitation requires a local trusted caller invoking the generator directly with a malicious `--slug`. Low likelihood, but the gap is inconsistent with how the repo hardened the identical class in `seed-tasklist.mjs` (CWE-78/-22) and the open-questions consolidator (CWE-22).
- **Recommendation**: Validate `slug` against `^[a-z0-9][a-z0-9-]*$` in `fragment-writer.mjs` before building the path; throw a clear error on mismatch. Mirrors the existing convention.

## Dependencies

No new packages. `route-resolver.mjs` and `fragment-writer.mjs` use only Node built-ins (`node:fs/promises`, `node:path`). No CVE surface introduced.

## Out of scope / Noted

- **`route-resolver.mjs` returns a workflow name, does not invoke it.** `resolveRouteWorkflow` only reads and type-checks `project.json → whatsnew.route_workflow` and returns the string. No command/path is executed from it. When a future per-project routing workflow *consumes* that name to dispatch, that consumer SHALL validate/allow-list the value before using it as a track id or path (A03/SSRF surface deferred to the routing-target work, which is an explicit non-goal of this spec). Noted for that follow-up.
- **Consent removal is intentional, not a bypass.** The old `changelog.mjs` checked `commit_consent` freshness because it wrote `CHANGELOG.md` inside the pre-commit window. The new generator writes only the gitignored fragment and is not a commit-gated phase, so removing the consent/TTL check is correct. The commit gate itself (`git_commit_guard` + `/grant-commit`) is unchanged; `commit.depends_on` now points directly at `grant-commit`. No access-control regression.
- **`whatsnew.mjs` reads a caller-named `--entries-file` and `project.json`.** Both are local, caller-controlled inputs; `JSON.parse` failures surface as clear errors. No trust-boundary crossing.

