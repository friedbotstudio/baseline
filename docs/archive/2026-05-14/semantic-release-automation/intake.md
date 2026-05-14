# Automate npm release via semantic-release with main + next channels

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The current `.github/workflows/release.yml` is a manually-dispatched, four-job pipeline (`build-verify` → `publish-npm` → `deploy-pages` / `push-bump` / `install-smoke`) that requires a human to pick a `bump_type` (major | minor | patch) on every release. Two consequences:

1. **Release cadence depends on operator memory.** A merged PR sits unpublished until someone remembers to click "Run workflow" and pick the right bump. The conventional-commit prefixes in commit messages (already in use across the branch) carry the bump intent — the workflow ignores them.
2. **No prerelease channel.** Consumers have no way to opt into pre-stable builds. The repo has no `next` branch and no `next` dist-tag on npm. Every published build immediately becomes the default install.

The repo currently sits at `create-baseline@0.1.0`. There is no `CHANGELOG.md` yet (despite the runbook expecting one for §"Pre-publish hygiene sweep"), no GitHub Release notes are generated, and PR contributors get no automated notification when their commit ships.

## Goal

Every merge to `main` automatically publishes the correct semantic version to npm under the `latest` dist-tag; every merge to `next` automatically publishes a prerelease under the `next` dist-tag. The bump type, changelog, git tag, GitHub Release, and PR comments are all derived from conventional commits — no operator picks the bump.

## Non-goals

- **Replacing the install-smoke job.** It stays — post-publish materialization check is still the correctness gate at the end of the pipeline.
- **Replacing the SHA-pinning + hardened-runner posture.** Every third-party action stays pinned to a 40-char SHA per the existing rule.
- **Migrating off OIDC trusted publishing.** Provenance + OIDC stays; we are not adding a long-lived `NPM_TOKEN` secret.
- **Cutting prereleases from arbitrary branches.** Only `next` produces prereleases in v1. Per-PR snapshot releases (`@semantic-release/exec` + `@pr-N`) are out of scope.
- **Enabling branch protection on `main` in this workflow.** Protection will be turned on in a follow-up; this workflow ships v1 with the unprotected-main path documented and a migration callout in the runbook.
- **Automating npm trusted-publisher registration.** The npmjs.com → `create-baseline` → Settings → Trusted Publishers step is a one-time manual prerequisite by the maintainer.
- **Replacing `docs-only` workflow_dispatch mode.** A site-only redeploy path stays available for content updates that don't warrant a release.

## Success metrics

- **Operator interactions per release** — baseline: 1 manual `workflow_dispatch` click + bump-type choice per release; target: 0 (PR merge is the only human input), measured via: GitHub Actions run history grouped by `event=workflow_dispatch` vs `event=push`.
- **Time from PR merge to npm publish** — baseline: variable (hours to days, depends on operator), target: < 10 min on `main`, < 10 min on `next`, measured via: timestamp delta between the merge commit and the `npm view create-baseline time.<version>` field.
- **Changelog coverage** — baseline: no CHANGELOG.md exists; target: every release after this workflow lands has a CHANGELOG.md entry with categorized commits, measured via: file presence + entry-per-tag diff check.
- **Prerelease availability** — baseline: 0 prereleases possible; target: `npm view create-baseline@next version` resolves to a `-next.N` build whenever the `next` branch is ahead of `main`, measured via: registry probe in install-smoke.

## Stakeholders

- **Requester**: Tushar Srivastava (project owner; today's `/harness` invocation).
- **Reviewer**: Tushar Srivastava (this is a single-maintainer repo at v0.1.0; the spec-approval gate is a self-review by the same person).
- **Operator** (runs it in prod): GitHub Actions on `push` to `main` or `next` — no human operator after merge. Tushar Srivastava remains accountable for the one-time `npmjs.com` trusted-publisher configuration and for the future branch-protection / GitHub App migration.

## Constraints

- **OIDC trusted publishing is mandatory.** The `publish-npm` job currently uses `id-token: write` + `npm publish --provenance` with no `NPM_TOKEN`. semantic-release's `@semantic-release/npm` must publish through the same OIDC path; falling back to a long-lived token is unacceptable. This requires a one-time manual prerequisite: register the GitHub Actions OIDC publisher on npmjs.com for the `create-baseline` package (Owner: `friedbotstudio`, Repo: `baseline`, Workflow: `release.yml`).
- **`main` branch protection deferred.** v1 uses the default `GITHUB_TOKEN` for the bump-commit + tag push (works on unprotected `main`). The runbook MUST carry a callout: "When branch protection lands, provision a GitHub App `release-bot` and add as exempt actor; rotate the workflow to use the App token." This is a documented future migration, not a v1 deliverable.
- **SHA-pinning of every third-party action.** Every action used (including any new `cycjimmy/semantic-release-action`-style wrapper, if adopted) must be pinned to a 40-char SHA with the tag in a trailing comment. The `scripts/verify-action-shas.mjs` step in `build-verify` must continue to pass.
- **`step-security/harden-runner` on every job.** Egress policy `audit` minimum.
- **`permissions: {}` baseline + per-job upgrade.** No workflow-wide elevation. Each job declares only what it needs; `publish-npm` needs `id-token: write`, `deploy-pages` needs `pages: write` + `id-token: write`, the bump-and-tag-push step needs `contents: write`.
- **Install-smoke preservation.** The post-publish job that runs `npx create-baseline ./target` + `scripts/install-smoke-verify.mjs` against the published version must still run on every release and gate the release as a whole (failure is a regression alert, not a publish-blocker — the publish has already happened, but the failure must be surfaced).
- **Pages deploy preservation.** `obj/site` continues to deploy to GitHub Pages on `main` releases only (not on `next` prereleases) and on `workflow_dispatch` `docs-only` mode.
- **Concurrency.** Strict serialization across the workflow remains required (one release at a time globally), to prevent race conditions on the bump commit + tag push.
- **Branches configuration.** Single config: `["main", {name: "next", prerelease: true}]`. Merging `next` into `main` cuts the stable from accumulated `-next.N` releases; semantic-release handles channel promotion automatically.
- **No new long-lived secrets.** The npm token is replaced by OIDC. The GitHub token is the default `GITHUB_TOKEN`. No PATs.

## Acceptance criteria

1. **Given** a merge commit lands on `main` with a `feat:` prefix and no prior `feat:`/`feat!:` since the last tag, **when** the release workflow runs, **then** semantic-release publishes a minor bump (e.g., `0.1.0` → `0.2.0`) to npm with the `latest` dist-tag, generates release notes in a GitHub Release, updates `CHANGELOG.md`, commits the bumped `package.json` + `CHANGELOG.md` back to `main`, and tags `v0.2.0`.

2. **Given** a merge commit lands on `next` with a `feat:` prefix, **when** the release workflow runs, **then** semantic-release publishes a minor prerelease (e.g., `0.1.0` → `0.2.0-next.1`) to npm with the `next` dist-tag, creates a GitHub Release marked as prerelease, updates `CHANGELOG.md` on `next`, commits + tags on `next`, and does NOT deploy GitHub Pages.

3. **Given** a `fix:` commit, **when** the release workflow runs, **then** the bump is patch (`0.1.0` → `0.1.1` on main; `0.1.1-next.1` on next).

4. **Given** a `feat!:` commit or any commit with `BREAKING CHANGE:` in the footer, **when** the release workflow runs, **then** the bump is major (`0.1.0` → `1.0.0` on main; `1.0.0-next.1` on next).

5. **Given** a commit prefixed with `chore:`, `docs:`, `style:`, `refactor:`, `test:`, or `ci:` and no `feat:`/`fix:`/breaking commit since the last tag, **when** the release workflow runs, **then** semantic-release reports "no release necessary" and exits 0 without publishing, tagging, or committing.

6. **Given** a release publishes successfully, **when** `install-smoke` runs against the published version, **then** the tarball materializes via `npx create-baseline ./target` and the manifest check passes (current behavior preserved).

7. **Given** a release publishes on `main`, **when** the workflow completes, **then** `obj/site` is built fresh against the bumped `package.json` and deployed to GitHub Pages.

8. **Given** a release publishes on `next`, **when** the workflow completes, **then** GitHub Pages is NOT redeployed (prereleases are not user-facing).

9. **Given** a PR is merged into `main` (or `next`) and includes one or more conventional commits, **when** the release workflow publishes the resulting version, **then** semantic-release comments on the closed PR with the published version number (the doc-transcript "GitHub action commented on this PR" behavior).

10. **Given** the npmjs.com trusted-publisher registration has NOT been configured, **when** the first run of the new workflow attempts `npm publish`, **then** the workflow fails with a clear OIDC-related error from npm (forcing function for the one-time prerequisite — explicitly NOT a silent fallback to anonymous publish).

11. **Given** the workflow is invoked via `workflow_dispatch` with `mode: docs-only`, **when** the run completes, **then** only the `deploy-pages` job runs (no npm publish, no commit, no tag).

12. **Given** all `verify-action-shas.mjs` invariants, **when** the new workflow is checked into the repo, **then** every third-party action used (including any semantic-release-related action) is pinned to a 40-char SHA with a trailing `# vX.Y.Z` comment.

13. **Given** the new workflow lands, **when** `audit-baseline` (`project.json → test.cmd`) runs, **then** it continues to PASS — no Article XI manifest drift, no skill/hook count drift, no constitutional citation drift.

## Open questions

- **OQ-1 (semantic-release vs slimmer alternative).** Research phase MUST verify (via `context7`) that semantic-release v24's `@semantic-release/npm` plugin supports OIDC trusted publishing + `--provenance` end-to-end with no `NPM_TOKEN`. If it does not (i.e., the plugin's publish path hardcodes a token check), the workflow will need a custom `prepare`-only semantic-release invocation + a separate `npm publish` step running `@semantic-release/npm`'s output. Decide post-research.

- **OQ-2 (PR comment scope).** semantic-release's `@semantic-release/github` plugin comments on PRs closed by released commits. The plugin uses `GITHUB_TOKEN` and needs `issues: write` + `pull-requests: write`. Confirm in research that these are the minimum scopes, and add them to the `release` job's `permissions:` block.

- **OQ-3 (CHANGELOG.md first generation).** The first auto-generated CHANGELOG.md will list every commit since the v0.0.0 implicit baseline, which may be unwieldy. Decide in spec: (a) accept the long initial entry as-is, (b) seed `CHANGELOG.md` with a "Pre-0.2.0 — see git log" stub, or (c) baseline the changelog from the most recent tag (`v0.1.0` once we tag it manually).

- **OQ-4 (`next` branch lifecycle).** `next → main` direct merge is the chosen v1 model. Confirm in spec: when `next` is merged into `main`, semantic-release on `main` will detect the accumulated `-next.N` versions and promote them to a single stable release. Validate this via dry-run in research before locking in.

- **OQ-5 (Pages deploy timing).** Currently `deploy-pages` runs in the same workflow as publish. In the new flow, should the Pages deploy run from the bumped `main` commit (after semantic-release pushes back) or from the pre-bump commit? Research/spec to decide. Implications: bumped → site reflects exact published version; pre-bump → faster, no extra checkout-after-push, but site lags by one commit.

- **OQ-6 (`workflow_dispatch` retention).** Confirm in spec that `workflow_dispatch` is retained for `mode: docs-only` only, AND consider whether a `mode: release` manual override is still useful (for emergency releases when push-based trigger fails). v1 default: docs-only only; manual release is `gh workflow run` + bypass — but document the fallback.

- **OQ-7 (concurrency group key).** Current `concurrency: release-${{ github.workflow }}` serializes globally. With two release-producing branches (`main` and `next`), should the group be per-workflow (current — serializes both) or per-branch (`release-${{ github.ref }}` — allows main and next to release in parallel)? Recommend keeping per-workflow for v1 (safer; prevents tag collisions on the bump-back push).
