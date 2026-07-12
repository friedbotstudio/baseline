# Security reports — auto-merge-classify-base-sha

## auto-merge-classify-base-sha-2026-07-12.md

# Security Review — auto-merge-classify-base-sha — 2026-07-12

## Summary

Overall risk: **LOW**. The diff closes the MEDIUM it targeted — pinning the `classify-and-enable` checkout to `github.event.pull_request.base.sha` removes the PR's ability to supply the code that judges it. I looked specifically for a plugged-one-hole-left-another outcome and did not find one: the classifier is the *only* PR-controlled execution surface in that job, and it is now base-controlled. Two residual properties are inherent to running CI on pull requests rather than defects introduced here; both are adequately bounded and are recorded below.

## Findings

No CRITICAL, HIGH, or MEDIUM findings in this diff.

### [LOW] The workflow definition itself remains PR-controlled under `pull_request`

- **OWASP**: A08 — Software & Data Integrity Failures | **CWE**: CWE-494 (Download of Code Without Integrity Check)
- **File**: `.github/workflows/auto-merge.yml:22-24` (trigger), `:54` (job)
- **Evidence**:
  ```yaml
  on:
    pull_request:
      branches: [main, next]
  ```
- **Impact**: For `pull_request` events GitHub executes the workflow file **from the PR merge ref**, not from the base branch. So the base-SHA checkout pin hardens *what the classifier is*, but it cannot harden *what the workflow does* — a PR can edit `auto-merge.yml` itself, delete the classify step, and call `gh pr merge --auto` unconditionally. The base-SHA pin lives inside the very file an attacker would rewrite.

  This is **not exploitable by an untrusted actor**, which is why it is LOW and not a blocker:
  - **Fork PRs** (the untrusted population): GitHub caps `GITHUB_TOKEN` to read-only for fork pull requests regardless of the workflow's declared `permissions:` block. `gh pr merge --auto` requires `pull-requests: write`, so it fails with 403. A fork cannot self-merge whether or not it rewrites the workflow.
  - **Same-repo branch PRs**: the actor already holds write access. With `required_pull_request_reviews: null` in `.github/branch-protection/main.json`, such an actor can already merge their own green PR by hand. Rewriting the workflow automates something they are already authorized to do — it is not a privilege escalation.
- **Recommendation**: No code change required in this diff. Preserve the assumption this rests on: keep the repository setting **"Send write tokens to workflows from fork pull requests" OFF** (GitHub's default). If that setting is ever enabled, this LOW becomes a **CRITICAL** — a fork PR could then rewrite `auto-merge.yml` and merge itself into `main` with no review. Worth asserting in the branch-protection-as-code surface if the API exposes it.

### [LOW] `pre-publish-checks` executes PR-controlled `npm ci` (pre-existing, correctly isolated)

- **OWASP**: A03 — Injection (supply-chain) | **CWE**: CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)
- **File**: `.github/workflows/auto-merge.yml:33-52`
- **Evidence**:
  ```yaml
  pre-publish-checks:
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@df4cb1c... # v6.0.3   (no ref: — PR merge ref, by design)
      - name: Install dependencies
        run: npm ci
  ```
- **Impact**: This job deliberately checks out the PR merge ref (it exists to *validate the PR's own content*), then runs `npm ci` against the PR's `package.json` / lockfile. A malicious PR can therefore achieve arbitrary code execution via an install script. This is the standard, universally-accepted risk of building a PR in CI — and it is correctly contained here:
  - the job declares only `contents: read`, so the RCE holds a read-only token;
  - for fork PRs the token is read-only anyway;
  - **job-level permissions isolate it from `classify-and-enable`** — the two jobs run on separate runners with separate tokens, and nothing is passed between them (no artifacts, no outputs). The RCE cannot reach the `contents: write` / `pull-requests: write` token held by the classify job.
  - `package.json` / `package-lock.json` / `npm-shrinkwrap.json` are on the classifier's NEVER-list, so a PR touching them never auto-merges regardless.
- **Recommendation**: No change. Confirming the caller's question: `pre-publish-checks` keeping the unpinned merge-ref checkout is **sound** — pinning it to base would defeat the job's entire purpose (it would validate the base branch, not the PR). The privilege separation, not the checkout ref, is what makes it safe.

## Answers to the review questions

**(a) Does the base-SHA pin fully close the self-classification path? — Yes.** The classifier binary now always comes from the target branch. Defense is in fact now *doubled*: even a hypothetical unpinned run would be caught, because `scripts/ci/**` and `.github/**` are both on the base NEVER-list (`low-risk-classifier.mjs:18-19`), and the file list is sourced from `gh pr diff` (the API) rather than the working tree — so a PR that edits the classifier is classified not-low-risk on the strength of the *path alone*, before its contents matter. The pre-fix exploit (rewrite the NEVER-list, widen the allowlist, self-approve) is dead.

**(b) Is `contents: write` + `pull-requests: write` still safe on the classify job? — Yes.** That privilege set is only reachable by code from the base branch now. The job runs exactly two commands against the token: `gh pr diff --name-only` (read) and `gh pr merge --auto` (the intended write). No PR-controlled code executes in the job that holds those scopes.

**(c) Is the classifier the ONLY PR-controlled execution surface in the classify job? — Yes, and it is now base-controlled.** I enumerated every step: `harden-runner` → `checkout` (now base) → `setup-node` (no `cache:` key, no lockfile read) → `Classify PR diff` → `Enable auto-merge`. Critically, **the classify job runs no `npm ci`**, so no PR-controlled install script executes in it. `low-risk-classifier.mjs` is stdlib-only (`node:url` is its sole import), has zero third-party dependencies, and reads **no configuration file from the tree** — its NEVER-list and allowlist are inline constants. There is no second file a PR could poison to steer the base classifier.

**(d) Is `pull_request` the right trigger? — Yes; `pull_request_target` would be strictly worse here.** `pull_request_target` runs with a *fully privileged* token even for fork PRs, which is the classic self-merge / secret-exfiltration footgun. The current design gets its safety from GitHub's fork-token cap, which `pull_request_target` would discard. Keep `pull_request`.

## Dependencies

No new packages in this diff. `.github/workflows/auto-merge.yml` gains one YAML key; `tests/auto-merge-workflow.test.mjs` imports only `node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:url`. Action SHA pins are unchanged — `node scripts/verify-action-shas.mjs` reports 6/6 verified.

## Out of scope / Noted

- **`required_pull_request_reviews: null`** (`.github/branch-protection/main.json:5`). No human review is required to merge to `main`; the only required context is `pre-publish-checks`. This is a deliberate posture choice, not a defect in this diff, and it is what bounds finding #1 to LOW (a write-access actor gains nothing by bypassing the classifier). It is worth a conscious re-affirmation: with no required review, the low-risk classifier is the *sole* mechanism deciding whether a change reaches `main` without a human looking at it.
- **`harden-runner` runs with `egress-policy: audit`**, which observes and reports egress but does not block it. Raising it to `block` with an allowlist would harden the `npm ci` RCE surface in `pre-publish-checks`. Out of scope here; a candidate for the CI-posture backlog.

