# Manually-triggered release workflow: bump version, deploy docs site to GitHub Pages, publish to npm

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

Releasing `create-baseline` today is a manual checklist from `docs/runbooks/npm-publish.md`: the operator edits `package.json` by hand, runs `npm run publish:check`, executes `npm publish --access public --provenance` from their workstation, then separately rebuilds and republishes the docs site (currently no automated path exists for the site at all — `npm run build:site` produces `obj/site/` and stops there).

This has three concrete failure modes:

1. **Workstation drift becomes supply-chain risk.** The runbook's Step 1.5 sweeps (dead-man's-switch indicators, jsonl credential leakage, 2FA posture, hardened `~/.npmrc`) are operator-machine sweeps. Performing the publish from an unaudited workstation is the exact attack vector Snyk's TanStack writeup names as catastrophic; the runbook acknowledges this and asks the operator to run four checks by hand on every release. Compliance with this checklist depends entirely on operator discipline.
2. **Two artifacts, two states.** The docs site at `obj/site/` and the npm tarball at `obj/template/` are built from the same source tree, but nothing today ties their deployment to a single release event. Drift between "what's on the GitHub Pages site" and "what's published to npm" is currently undetectable until a user reports it.
3. **No published version is reproducible from a known commit.** `npm publish --provenance` attests the build, but provenance attestation requires running publish from inside a GitHub Actions workflow that the package's npm settings recognize as trusted. Publishing from a workstation cannot produce provenance, even when the operator's machine is clean.

## Goal

A maintainer can cut a release of `create-baseline` and the docs site by clicking "Run workflow" once in the GitHub Actions UI, selecting major / minor / patch, and walking away — and the resulting npm tarball carries SLSA L3 provenance attesting it was built by this repository's release workflow on a known commit.

## Non-goals

- Automated version-bump decisions based on conventional commits or commit-message parsing. The bump type is operator-chosen, every time.
- Pre-release / beta / rc tag handling in this workflow. Pre-releases are out of scope for v1; the runbook's `--tag beta` path stays manual until a follow-up.
- A CI pipeline for pull requests. This workflow is release-only; PR CI is a separate concern.
- Auto-generated changelog or release-notes scaffolding. The runbook's `docs/release-notes/<version>.md` convention stays manual.
- Replacing the existing local `npm run publish:check` workflow. The CI workflow runs the same precheck script; the local script remains the authoritative pre-publish gate operators can run before merging.
- Egress monitoring via `step-security/harden-runner` in *audit* mode is in scope as a recommendation from the runbook; *block* mode with a vetted allowlist is a follow-up.

## Success metrics

- **Publish path consolidation** — baseline: 2 (manual workstation publish + manual site rebuild), target: 1 (single workflow_dispatch), measured via: count of distinct operator-driven steps in the documented release path.
- **Provenance coverage** — baseline: 0% of published versions carry provenance attestation, target: 100% of versions published via the new workflow, measured via: `npm view create-baseline@<version> --json` field `dist.attestations`.
- **Time from "click Run workflow" to "version installable via npx"** — baseline: ~10–15 minutes operator wall time per the runbook, target: ≤ 6 minutes end-to-end CI time (allowing registry replication), measured via: GitHub Actions run duration + post-publish `npx --yes create-baseline@<version>` smoke from a runner-side tmpdir.
- **Site-publish drift** — baseline: untracked, target: 0 releases where the deployed Pages site does not match the commit that produced the published tarball, measured via: a build-id string (the workflow run id) baked into both `obj/template/manifest.json` and the rendered site footer, compared post-deploy.

## Stakeholders

- **Requester**: project maintainer (razieldecarte@gmail.com — sole maintainer per the runbook's "no project-specific channel today; tell them via the repo's README.md issues link" framing).
- **Reviewer**: same.
- **Operator** (who runs it in prod): same. The workflow is operator-triggered and operator-supervised; "prod" here is the public npm registry + `friedbotstudio.github.io/baseline` (or equivalent Pages URL).

## Constraints

- **Article XI ownership manifest.** Any new files under `.claude/` would change the audit's baseline manifest. This workflow lives at `.github/workflows/release.yml` — outside `.claude/` — and is therefore exempt from the baseline manifest. No audit drift expected.
- **Article VII git rules.** This project is currently a non-git working tree (`git rev-parse` exits non-zero). The workflow YAML is authored here and only runs once the tree is pushed to GitHub. Authoring the file does not invoke any git operation.
- **Runbook §"Future-CI invariants" is binding before this workflow runs.** Specifically:
  - Every third-party Action `uses:` line outside `actions/*` first-party actions resolves to a 40-character commit SHA, with the tag in a trailing comment.
  - `setup-*` actions in the release job set `cache: false`. `actions/cache` does not appear in this workflow at all.
  - `step-security/harden-runner` recommended on every job. (Audit mode v1; block mode is a follow-up.)
- **Runbook §"Step 2 — Precheck" is binding.** The workflow runs `npm run publish:check` before any `npm publish`. A non-zero exit halts the publish step.
- **Runbook §"Step 4 — Publish" command shape.** `npm publish --access public --provenance`. `--access public` is defensive for an unscoped package per the runbook; `--provenance` requires the workflow to be the trusted publisher.
- **npm 2FA `auth-and-writes` mode.** The runbook mandates this. `auth-and-writes` blocks unattended publish with a long-lived token; the only sanctioned unattended path is npm trusted publishing via OIDC. (See Open question 1.)
- **Node engine.** `package.json → engines.node = ">=18.17.0"`. The workflow's `setup-node` version must satisfy this; pin to `node-version: '22'` per the runbook's example.
- **No `--no-verify` / `--no-gpg-sign` flags anywhere.** CLAUDE.md Article VII forbids it.
- **Eleventy build target.** `npm run build:site` writes `obj/site/`. The Pages deploy step reads from there.

## Acceptance criteria

1. **Trigger contract.** Given a maintainer with workflow-dispatch permission on `friedbotstudio/baseline`, when they open Actions → Release → Run workflow and select one of `{major, minor, patch}` from the `bump_type` input, then the workflow accepts the input and runs without further user input.
2. **Version bump.** Given `bump_type=patch` and current `package.json → version = X.Y.Z` on `main`, when the workflow completes successfully, then `package.json → version` is `X.Y.(Z+1)` on `main` (the bump commit is pushed back — see Open question 2). The bump for `minor` and `major` follows semver.
3. **Precheck gate.** Given the workflow has reached the precheck step, when `npm run publish:check` returns non-zero (any of `precheck`, `files-diff`, `smoke` fails), then `npm publish` is NOT executed, no Pages deploy occurs, no commit is pushed, and the workflow exits non-zero with the failed sub-step named in the run log.
4. **Provenance attestation.** Given the workflow has reached the publish step and precheck passed, when `npm publish` is invoked, then it runs as `npm publish --access public --provenance` and the registry response includes a `dist.attestations.provenance` blob. `npm view create-baseline@<new-version> --json` after the run confirms it.
5. **SHA-pin invariant.** Given the workflow YAML, when every `uses:` line is inspected, then every reference to a third-party Action (anything not in the `actions/*` or `github/*` first-party namespaces) is pinned to a 40-character commit SHA, with the human-readable tag in a trailing `# vX.Y.Z` comment.
6. **Cache invariant.** Given the workflow YAML, when grep'd, then (a) the string `actions/cache` does not appear, and (b) every `setup-*` action that supports caching has `cache: false` set explicitly.
7. **Harden-runner present.** Given any job in this workflow that runs `npm install`, `npm publish`, or any network operation, when the job starts, then `step-security/harden-runner` is the first step (audit mode is sufficient for v1).
8. **Pages deploy.** Given the workflow has reached the deploy step and the build step produced `obj/site/`, when the deploy step runs, then GitHub Pages serves the new build at the project's Pages URL within the deploy step's window, and the `actions/deploy-pages` action's `page_url` output is non-empty.
9. **Build-id traceability.** Given a successful workflow run with run id `R`, when the published tarball's `obj/template/manifest.json` is inspected AND the deployed Pages site's footer is inspected, then both carry the same build-id string derived from `R` (e.g. `gha-<run_id>`). This satisfies the success-metric "site-publish drift = 0".
10. **Post-publish install smoke.** Given the workflow has successfully published `<new-version>`, when the workflow's final step runs `npx --yes create-baseline@<new-version> ./target` from a fresh runner-side tmpdir, then the command exits zero and produces a `target/.claude/` directory whose `.baseline-manifest.json` matches `obj/template/manifest.json` from the published tarball.
11. **Failure fence.** Given any step before publish fails (bump, build:site, build-template/prepack, publish:check), when the step exits non-zero, then no subsequent step runs and no artifact is published or deployed.
12. **Concurrency guard.** Given a release workflow run is in progress, when a second `workflow_dispatch` is submitted, then the second run is queued (not cancelled, not parallel-published) and runs only after the first completes — preventing two `npm publish` invocations racing against the registry.

## Open questions

These block the next phase until answered. The spec must resolve each before the workflow YAML is authored.

1. **npm publish auth mechanism.** Trusted publishing via OIDC vs `NPM_TOKEN` repository secret. Trusted publishing is the runbook-aligned answer (provenance attestation requires it; `auth-and-writes` 2FA forbids long-lived tokens for publish). It requires (a) configuring `create-baseline` on npmjs.com with this repo + workflow path as a trusted publisher, (b) `permissions: id-token: write` on the publish job, (c) registering the publisher *before* the first run. Trade-off: one-time npmjs.com configuration step the operator must perform manually before the workflow can ever succeed.
2. **Push version-bump commit + `vX.Y.Z` tag back to `main`?** Yes is conventional (the published version is grep-able in git history). No is simpler (no `contents: write` permission needed; bump lives only in the published tarball). If yes: the workflow needs `permissions: contents: write`, a commit author identity (default to `github-actions[bot]`), and a strategy for the case where `main` advanced during the run (rebase? fail and ask the operator?). Recommendation: yes, with `fail-on-conflict` semantics (do not auto-rebase).
3. **Pages deploy ordering vs publish.** Three options: (a) deploy Pages then publish npm, (b) publish npm then deploy Pages, (c) run both in parallel after a shared precheck/build job. Option (a) means a Pages site can be live for a version that never reached npm (if publish fails after deploy). Option (b) means npm can have a version whose Pages site is broken (if deploy fails after publish). Option (c) is fastest but doubles failure surface. Recommendation: (b) — npm is the harder-to-roll-back artifact, so it should land last and only after every preceding step is green; a failed Pages deploy after a successful npm publish is operator-recoverable via a re-run of just the deploy step.
4. **Pre-release tag handling.** This intake's non-goals exclude pre-releases from v1. Confirm: do not add a `prerelease` option to `bump_type` for now? The runbook's `npm publish --tag beta` flow stays manual.
