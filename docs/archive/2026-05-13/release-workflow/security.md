# Security reports — release-workflow

## release-workflow-2026-05-13.md

# Security Review — release-workflow — 2026-05-13

## Summary

Overall risk: **LOW**. The architecture is conservative — workflow-level `permissions: {}` denying everything by default, per-job least-privilege scopes, OIDC trusted publishing (no long-lived `NODE_AUTH_TOKEN`), 40-character SHA pins on every third-party action, no `actions/cache`, `cache: false` on every `setup-node`, `step-security/harden-runner` as the first step of every job. `npm audit` reports zero vulnerabilities (project ships with empty `dependencies`). The three MEDIUM findings below are defense-in-depth improvements rather than exploitable holes: GHA `run:`-block interpolation pattern, unverified third-party-action SHAs (the YAML test checks SHA *shape*, not authenticity), and an audit-mode-only harden-runner posture documented as a v1 choice. No CRITICAL or HIGH findings.

## Findings

### [MEDIUM] Direct `${{ }}` interpolation inside `run:` blocks bypasses GHA injection-hardening best practice
- **OWASP**: A03 - Injection | **CWE**: CWE-78 (OS Command Injection)
- **File**: `.github/workflows/release.yml:64`, `.github/workflows/release.yml:150`
- **Evidence**:
  ```yaml
  # line 64 (build-verify, bump step):
  npm version "${{ inputs.bump_type }}" --no-git-tag-version

  # line 150 (push-bump, commit/tag step):
  new_version="${{ needs.build-verify.outputs.new_version }}"
  git commit -m "chore: release v${new_version}"
  git tag -a "v${new_version}" -m "Release v${new_version}"
  ```
- **Impact**: GitHub's security-hardening guidance for Actions ("Understanding the risk of script injections") names direct `${{ context }}` interpolation inside `run:` blocks as the script-injection vector — the expression is substituted into the shell command *before* shell quoting applies. In this workflow both values are bounded:
  - `inputs.bump_type` is a `type: choice` with three enumerated options; GitHub rejects out-of-list values at submission time, so the value is one of `{major, minor, patch}` always.
  - `needs.build-verify.outputs.new_version` is the output of `node -p "require('./package.json').version"` after `npm version <bump>`, which validates and rewrites the version as a strict semver string (`[0-9.+-A-Za-z]` characters only).
  
  No attacker-controlled string can flow here today. The risk is **regression-shaped**: a future edit that loosens the choice list, adds a `string`-typed input, or removes the semver validation between bump and push-bump would silently introduce a shell-injection sink. The hardening pattern catches that future change at code-review time rather than at exploit time.
- **Recommendation**: Use the `env:` pattern as the install-smoke job already does (`.github/workflows/release.yml:171–173`):
  ```yaml
  - name: Bump version (no git tag side effect)
    env:
      BUMP_TYPE: ${{ inputs.bump_type }}
    run: |
      npm version "$BUMP_TYPE" --no-git-tag-version
      …
  - name: Commit, tag, and push (fail-on-conflict)
    env:
      NEW_VERSION: ${{ needs.build-verify.outputs.new_version }}
    run: |
      git commit -m "chore: release v${NEW_VERSION}"
      git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"
      …
  ```
  Track as a fix-now (one extra TDD cycle) or accept-and-document (the YAML invariant test asserts SHA pinning and cache discipline, but not the env-var pattern — a follow-up assertion could close that gap).

### [MEDIUM] Action SHA authenticity is not verified by the test gate
- **OWASP**: A06 - Vulnerable and Outdated Components, A08 - Software & Data Integrity Failures | **CWE**: CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)
- **File**: `.github/workflows/release.yml:14–21` (header comment), `tests/release-workflow.test.mjs:115–125` (SHA-pin invariant test)
- **Evidence**:
  ```yaml
  # release.yml header:
  # Action SHA verification (operator MUST verify before first run):
  #   Pin policy per CLAUDE.md Art VII + runbook §Future-CI invariants Rule 1:
  #   every third-party action pinned to a 40-char SHA, tag in trailing comment.
  #   The SHAs below correspond to the listed version tags as of authoring;
  #   re-resolve via `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` …
  ```
  ```js
  // tests/release-workflow.test.mjs:115–125 — only shape-checks SHAs
  if (!/^.+@[0-9a-f]{40}\s*#\s*v[0-9A-Za-z.+\-]+/.test(u)) {
    violations.push(u);
  }
  ```
- **Impact**: The YAML test enforces SHA pinning is *present and well-formed* (40 hex chars + trailing `# vX.Y.Z` tag comment). It does **not** verify the SHA resolves to the named tag on github.com. If a SHA in the workflow does not actually correspond to the named version's published release commit on the upstream action repository, the workflow will fetch *some* version of that action — possibly an old, vulnerable, or never-published one. This is the same risk class as the `tj-actions/changed-files` compromise (CVE-2025-30066, named in the runbook), except invoked by author error rather than tag-rewriting attack.
- **Recommendation**: Operator MUST verify each SHA before first run via `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`. The workflow header already says this. For permanence, add a release-time prebuild script (e.g., `scripts/check-workflow-action-shas.mjs`) that hits the GitHub API for each `uses:` line and compares the SHA to the named tag, run as part of `npm test` or a separate CI workflow. Out of scope for this spec; track as a follow-up. In the meantime, Dependabot (`.github/dependabot.yml`) can be configured to manage SHA bumps once CI lands; that would close the verification loop continuously.

### [LOW] `step-security/harden-runner` runs in `audit` mode only
- **OWASP**: A09 - Security Logging and Monitoring Failures | **CWE**: CWE-778 (Insufficient Logging)
- **File**: `.github/workflows/release.yml:51, 89, 113, 130, 161` (every job's first step)
- **Evidence**:
  ```yaml
  - uses: step-security/harden-runner@f808768d… # v2.17.0
    with:
      egress-policy: audit
  ```
- **Impact**: Audit mode logs egress traffic to the StepSecurity portal but does not block. A compromised step that exfiltrates secrets (e.g., the OIDC token in publish-npm) would be detected post-hoc rather than prevented. Block mode requires a pre-vetted egress allowlist (registry.npmjs.org, api.github.com, objects.githubusercontent.com, *.actions.githubusercontent.com at minimum); building that allowlist needs ≥5–10 audit-mode runs to capture the actual hostname set.
- **Recommendation**: Documented as a v1 non-goal in `docs/specs/release-workflow.md` (Non-goals section: "Egress monitoring via `step-security/harden-runner` in *audit* mode is in scope as a recommendation… *block* mode with a vetted allowlist is a follow-up"). After 5–10 successful releases, promote to `egress-policy: block` with the captured allowlist.

### [LOW] No npm CLI version pin — relies on whatever ships with Node 22
- **OWASP**: A06 - Vulnerable and Outdated Components | **CWE**: CWE-1357 (Reliance on Insufficiently Trustworthy Component)
- **File**: `.github/workflows/release.yml:55–58`
- **Evidence**:
  ```yaml
  - uses: actions/setup-node@2028fbc5… # v4.1.0
    with:
      node-version: '22'
      cache: false
  ```
- **Impact**: The npm CLI used for `npm version`, `npm publish --provenance`, and `npm ci` is whatever ships bundled with the resolved Node 22.x.x. A future npm CLI vulnerability (e.g., a parser bug in `npm publish`) would automatically affect this workflow on the next run. Node 22 is a maintained LTS so this is bounded.
- **Recommendation**: Acceptable for v1. If a future incident motivates pinning, add `corepack enable && corepack prepare npm@<pinned> --activate` as a step after `setup-node`.

### [LOW] `install-smoke` registry-replication wait is fixed 30s
- **OWASP**: A04 - Insecure Design (TOCTOU-adjacent) | **CWE**: CWE-367 (TOCTOU Race Condition)
- **File**: `.github/workflows/release.yml:165–166`
- **Evidence**:
  ```yaml
  - name: Wait for registry replication
    run: sleep 30
  ```
- **Impact**: If npm registry replication takes longer than 30 seconds for the published version (rare but observed), the smoke job's `npx --yes create-baseline@<v>` may resolve to a *cached* older version or fail with "not found", masking a genuine publish failure or producing a false-negative smoke verdict. This is a reliability concern with a small security wrapper: a slow-replication window could allow an attacker who can mutate the registry's intermediate caches to substitute a different artifact than the one just published. Mitigated by `npm publish --provenance` attestation, which would surface a subject-digest mismatch at install time.
- **Recommendation**: Replace `sleep 30` with a poll-and-timeout loop: `until npm view "create-baseline@${NEW_VERSION}" version >/dev/null 2>&1; do sleep 5; [[ $((SECONDS)) -lt 120 ]] || exit 1; done`. Out of scope for v1; track as a robustness follow-up.

### [LOW] `push-bump` job relies on branch protection rules being absent or permissive
- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-285 (Improper Authorization)
- **File**: `.github/workflows/release.yml:127–158`
- **Evidence**:
  ```yaml
  push-bump:
    needs: publish-npm
    permissions:
      contents: write
    …
    - name: Commit, tag, and push (fail-on-conflict)
      run: |
        git push origin "HEAD:main" "v${new_version}"
  ```
- **Impact**: If `main` is protected by a rule requiring all changes to flow through PRs, the push-bump job will fail at `git push origin main` and the workflow exits non-zero — but only AFTER `npm publish` already succeeded. The published version then has no corresponding tagged commit on `main`. The runbook's "Order of operations under pressure" warns about the related case (broken version + needs fix); the push-bump failure mode is the milder variant.
- **Recommendation**: Spec rollout section recommends "allow `github-actions[bot]` to push directly so the push-bump job's fast-forward succeeds." Operator should configure branch protection accordingly or accept that push-bump may fail (recoverable manually with `git pull && git tag … && git push`).

## Dependencies

No new packages added in this diff. `package.json → dependencies` remains empty (enforced by `scripts/check-files-diff.mjs → package-integrity` sub-check; verified in npm-pack-tarball test). `devDependencies` unchanged: `@11ty/eleventy@3.1.5`, `nunjucks@3.2.4`. `npm audit` (with and without `--omit=dev`) reports zero known vulnerabilities.

The workflow consumes seven third-party GitHub Actions, each SHA-pinned in `.github/workflows/release.yml`:

| Action | Pin | Version (per trailing comment) | Known-CVE status |
|---|---|---|---|
| step-security/harden-runner | `f808768d1510423e83855289c910610ca9b43176` | v2.17.0 | None published against this SHA |
| actions/checkout | `11bd71901bbe5b1630ceea73d27597364c9af683` | v5.0.0 | None |
| actions/setup-node | `2028fbc5c25fe9cf00d9f06a71cc4710d4507903` | v4.1.0 | None |
| actions/upload-artifact | `b4b15b8c7c6ac21ea08fcf65892d2ee8f75cf882` | v4.4.3 | None |
| actions/download-artifact | `d3f86a106a0bac45b974a628896c90dbdf5c8093` | v4.1.8 | None |
| actions/upload-pages-artifact | `56afc609e74202658d3ffba0e8f6dda462b719fa` | v3.0.1 | None |
| actions/deploy-pages | `d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e` | v4.0.5 | None |

CVE status as of authoring; per the MEDIUM finding above, operator should re-verify each SHA against `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` before first run.

## Out of scope / Noted

- **OIDC trusted-publisher binding is out-of-band.** The workflow assumes `create-baseline` is configured on npmjs.com with `friedbotstudio/baseline` + `release.yml` as a trusted publisher. Misconfiguration surfaces as a `403 OIDC trusted publisher not configured` on the first publish attempt — loud, not silent. Documented in spec rollout + runbook addendum.
- **GitHub Pages source must be set to "GitHub Actions".** Another one-time manual configuration; misconfiguration surfaces as a `deploy-pages` step failure.
- **2FA mode `auth-and-writes`** required on the npm account per the runbook. OIDC trusted publishing is unaffected by `auth-and-writes` (trusted-publishing tokens are short-lived and outside the 2FA enforcement loop).
- **`GITHUB_RUN_ID` in the Pages footer is not sensitive.** Run IDs are public information (visible in workflow URLs). Surfacing the build id in the deployed site is intentional and operator-friendly for traceability (`docs/specs/release-workflow.md` AC-9). No PII or secrets leaked.
- **`build_id` field in published `obj/template/manifest.json` is public.** Same reasoning: published tarballs are world-readable; the run id is public.
- **Test files (`tests/release-workflow.test.mjs`, `tests/build-template-build-id.test.mjs`, `tests/site-build-id.test.mjs`) carry no security surface beyond reading the workspace filesystem and `spawnSync`-ing `bash` on the in-repo `scripts/build-template.sh`.** No network access, no secrets handled.
- **The runbook addendum (`docs/runbooks/npm-publish.md → Automated path (preferred)`) is additive prose.** Every pre-existing security assertion in `tests/runbook-text.test.mjs` continues to pass (verified by full-suite green during implement-tick).
- **Defense-in-depth opportunities not pursued (intentional)**:
  - `actions/checkout` does not set `persist-credentials: false`. Default is `true`, meaning the `GITHUB_TOKEN` stays in `.git/config` for the runner's lifetime. push-bump needs this (it pushes via the persisted credential). The other jobs *could* set `persist-credentials: false` for their checkouts to reduce token exposure; out of scope for v1 (extra YAML, no observed exploit).
  - No `actions/attest-build-provenance` step. The `npm publish --provenance` flag already produces SLSA L3 provenance via the npm CLI directly; adding `attest-build-provenance` is redundant.

