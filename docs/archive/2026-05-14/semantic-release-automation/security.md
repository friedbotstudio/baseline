# Security reports — semantic-release-automation

## semantic-release-automation-2026-05-14.md

# Security Review — semantic-release-automation — 2026-05-14

## Summary

Overall risk: **MEDIUM** (one rollout-blocking dependency-integrity finding; otherwise the workflow rewrite improves the prior security posture). The new release.yml fully adopts the env-var bridge pattern that was the predecessor spec's top MEDIUM finding (no direct `${{ }}` substitution in any `run:` block); OIDC trusted publishing is preserved; SHA-pinning is preserved on every third-party `uses:`; harden-runner remains the first step of every job; per-job permissions are scoped to least privilege per role; `npm audit` reports **zero** vulnerabilities (info/low/moderate/high/critical = 0). The one MEDIUM finding below is a lockfile drift that will fail the workflow's `npm ci` step before semantic-release runs — caught at security review, fixable in one command.

## Findings

### [MEDIUM] `package-lock.json` is out of sync with `package.json` after devDep additions
- **OWASP**: A06 - Vulnerable and Outdated Components, A08 - Software & Data Integrity Failures | **CWE**: CWE-1357 (Reliance on Insufficiently Trustworthy Component)
- **File**: `package.json:43–47` (new devDeps), `package-lock.json` (0 references to `semantic-release`)
- **Evidence**:
  ```
  $ grep -c "semantic-release" package-lock.json
  0
  $ npm ci --dry-run
  npm error  (EUSAGE class — lockfile / package.json mismatch)
  ```
- **Impact**: The implement worker added three devDeps (`semantic-release@25.0.3`, `@semantic-release/changelog@6.0.3`, `@semantic-release/git@10.0.1`) to `package.json` but did not regenerate `package-lock.json`. Consequences:
  1. **Rollout-blocking**: the release job's `npm ci` step (release.yml:73–74) will fail with `EUSAGE` on the first push to `main` or `next`. semantic-release never runs; first release fails before it can exercise AC-001/AC-002.
  2. **Transitive-dep integrity**: without a lockfile entry for the new direct deps, every CI run resolves transitives fresh from the registry — opening a window for a malicious transitive published *between* CI runs. `npm ci` against a locked tree would catch this; an uncommitted-lockfile workflow does not.
  3. **Local reproducibility**: developers running `npm ci` locally hit the same `EUSAGE` failure; this surfaced this finding during the security review's `npm ci --dry-run` probe.
- **Recommendation**: Run `npm install` from the repo root to regenerate `package-lock.json` with the three new direct deps + their transitives, then commit the updated lockfile alongside the other changes. The `/integrate` phase will re-run `audit-baseline` and tests; the lockfile regeneration is a one-command fix that closes the rollout-blocker. Adding a regression test that `package-lock.json` contains an entry for every direct devDep is out of scope here (could land in a follow-up).

### [LOW] Release-job permission surface widens to `contents: write + id-token: write + issues: write + pull-requests: write`
- **OWASP**: A05 - Security Misconfiguration | **CWE**: CWE-272 (Least Privilege Violation)
- **File**: `.github/workflows/release.yml:51–55`
- **Evidence**:
  ```yaml
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
      issues: write
      pull-requests: write
  ```
- **Impact**: The predecessor workflow split these into three jobs (`publish-npm` had `id-token: write + contents: read`; `push-bump` had `contents: write`). The new design colocates OIDC minting + git push + GH Release creation + PR commenting in one job because semantic-release does all four in one invocation. This widens the blast radius if an injected step or a compromised plugin in the semantic-release chain runs within this job. Mitigations in place: (a) every `uses:` is SHA-pinned with `# vX.Y.Z` trailing comment; (b) `verify-action-shas.mjs` runs as a step before `npx semantic-release` and fails the job on drift; (c) `harden-runner` audit-mode catches unexpected egress; (d) workflow-level `permissions: {}` baseline denies everything to jobs that don't explicitly elevate. Research memo (`docs/research/semantic-release-automation.md`) acknowledged this tradeoff under Candidate A vs B; spec selected Candidate B with the wider permission set as a deliberate choice for shape parity with the docs' canonical example.
- **Recommendation**: Accept for v1; track as a follow-up consideration. If the project ever needs to separate the OIDC-bearing publish step from the git-push step, the semantic-release `--dry-run` + a separate publish job is the path. No fix today.

### [LOW] `step-security/harden-runner` remains in `egress-policy: audit` mode
- **OWASP**: A09 - Security Logging and Monitoring Failures (defensive depth, not a vulnerability) | **CWE**: CWE-693 (Protection Mechanism Failure)
- **File**: `.github/workflows/release.yml:57`, `:100`, `:122`
- **Evidence**:
  ```yaml
  - uses: step-security/harden-runner@9ca718d3bf646d6534007c269a635b3e54cadf99 # v2.19.2
    with:
      egress-policy: audit
  ```
- **Impact**: Same posture as the predecessor workflow's review (carried forward). Audit mode logs egress but does not block — a compromised dependency could exfiltrate during a release run; the audit log surfaces the egress after the fact via the StepSecurity portal. Block-mode is tracked as a v2 evaluation candidate after enough audit-mode runs produce an allowlist.
- **Recommendation**: No change at v1. Follow-up: after the first ~10 successful auto-releases produce a stable egress allowlist, evaluate block-mode for a future spec.

### [LOW] YAML invariant tests do not verify SHA authenticity against upstream
- **OWASP**: A06 - Vulnerable and Outdated Components, A08 - Software & Data Integrity Failures | **CWE**: CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)
- **File**: `tests/release-workflow.test.mjs:266–276` (SHA-pin shape test), mitigated by `.github/workflows/release.yml:67–68` (runtime authenticity check)
- **Evidence**:
  ```js
  // tests/release-workflow.test.mjs — asserts SHA shape, not identity:
  if (!/^.+@[0-9a-f]{40}\s*#\s*v[0-9A-Za-z.+\-]+/.test(u)) {
    violations.push(u);
  }
  ```
- **Impact**: The test verifies every third-party action is pinned to a 40-char hex SHA with a tag comment — but does not verify the SHA actually corresponds to the named tag's commit on the upstream repo. A malicious patch that introduced `harden-runner@<unrelated-40-char-hex> # v2.19.2` would pass the shape test. This was a MEDIUM in the predecessor review; downgraded to LOW here because the runtime check `node scripts/verify-action-shas.mjs` runs as a release-job step before semantic-release fires (release.yml:67–68) — it resolves each pinned SHA against the upstream tag's commit via `git ls-remote` and fails the job on drift. The runtime check is strictly stronger than a test-time shape check; the test merely backstops it.
- **Recommendation**: Accept. The runtime gate is the authoritative defense; the test is a complementary shape-check. No change today.

## Positive notes (improvements over the predecessor)

1. **Env-var bridge fully adopted.** The predecessor's top MEDIUM was direct `${{ inputs.bump_type }}` and `${{ needs.build-verify.outputs.new_version }}` interpolation inside `run:` blocks. The new workflow has **zero** direct `${{ }}` interpolation in any `run:` block — `GITHUB_TOKEN`, `NEW_VERSION`, and `WORKSPACE` all flow through `env:` bindings (`release.yml:81–83`, `:133–135`, `:147–149`). The script-injection regression risk that worried the prior review is closed by design.
2. **NPM_TOKEN secret eliminated.** No long-lived publish credential anywhere in the workflow — OIDC trusted publishing covers it.
3. **`bump_type` choice input removed.** The predecessor accepted operator-supplied `bump_type`; the new flow derives bump from conventional commits via the commit-analyzer plugin. One fewer attacker-controllable input surface.

## Dependencies

| Package | Version | CVE check | Notes |
|---|---|---|---|
| `semantic-release` | 25.0.3 (latest) | `npm audit`: 0 vulns at all severities | bundles `@semantic-release/{commit-analyzer, release-notes-generator, npm, github}` as transitives |
| `@semantic-release/changelog` | 6.0.3 (latest) | 0 vulns | direct dep |
| `@semantic-release/git` | 10.0.1 (latest) | 0 vulns | direct dep |

`npm audit --json` metadata.vulnerabilities returns `{info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0}`.

## Out of scope / noted for later

- **Branch protection on `main`** is deferred to a follow-up (intake constraint + runbook callout). When protection lands, the default `GITHUB_TOKEN` will be rejected by `@semantic-release/git`'s push and the workflow will fail. The intake + spec already document the GitHub App `release-bot` migration path. Not a security finding for v1; a known operational tradeoff.
- **npm trusted-publisher first-run failure (AC-010 forcing function)** is intentional and out of scope of the security surface — it's a configuration prerequisite, not a vulnerability. The 403 OIDC-trusted-publisher-not-configured response from npm is the design's fail-closed behavior.
- **Lockfile-rotation regression test** — adding a `tests/lockfile-sync.test.mjs` that asserts every direct devDep has a `package-lock.json` entry would close the failure mode this review caught. Suggested follow-up; not in this branch's scope.

