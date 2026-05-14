# Pattern Research — semantic-release-automation

Two real-shape candidates. The user has already committed to **semantic-release + full push-driven automation + OIDC + main/next channels** (intake decisions); research's job is to pick the right *job graph shape* and resolve seven OQs from intake against current docs.

## API references (verified via context7)

All references resolved against `/websites/semantic-release_gitbook_io` (current docs, 278 indexed snippets, High reputation, score 77.75). Cross-referenced against `/semantic-release/semantic-release` (GitHub README, 112 snippets, score 83.75).

| Reference | Source path inside docs |
|---|---|
| **OIDC trusted publishing + provenance** — eliminates `NPM_TOKEN`, provenance auto-generated, "npm registry authorizes the workflow that triggers the run, not any subsequently invoked workflows" | `recipes/ci-configurations/github-actions` → §Trusted publishing and npm provenance |
| **Canonical workflow YAML** — `permissions: contents: write, issues: write, pull-requests: write, id-token: write`; checkout `fetch-depth: 0`; `npm audit signatures` step; `npx semantic-release` invocation; `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` env | `recipes/ci-configurations/github-actions` → §Basic GitHub Actions Workflow |
| **Branches config** — `{ "branches": ["master", "next"] }` (or `["main", "next"]`); the long form is `["main", {name: "next", prerelease: true}]` | `usage/configuration` → §Configure branches via .releaserc |
| **Channel promotion semantics** — commits to `next` produce `vX.Y.Z-next.N` on the `@next` dist-tag; merging `next` → `main` promotes accumulated commits, semantic-release calculates the right `@latest` version respecting both channels' history (a `feat:` after a `next`-channel breaking change still lands on `@latest` with the correct minor bump) | `recipes/release-workflow/distribution-channels` → §Feature Release to @next + §Feature Release to @latest |
| **Plugin lifecycle methods** — `@semantic-release/commit-analyzer` (`analyzeCommits`), `@semantic-release/release-notes-generator` (`generateNotes`), `@semantic-release/changelog` (`verifyConditions`, `prepare`), `@semantic-release/npm` (`verifyConditions`, `prepare`, `publish`), `@semantic-release/git` (`verifyConditions`, `prepare`), `@semantic-release/github` (`verifyConditions`, `publish`, `success`, `fail`) | `extending/plugins-list` → §Official Plugins Overview |
| **First four plugins (`commit-analyzer`, `release-notes-generator`, `npm`, `github`) ship inside `semantic-release`** — no separate `npm install`; `changelog` and `git` are external | same as above |

## Candidate A: Single push-triggered `release` job + `workflow_dispatch` for `docs-only`

- **Summary**: One workflow file. `on: push: branches: [main, next]` plus retained `workflow_dispatch` with `mode: docs-only` only. Single `release` job runs `semantic-release` end-to-end (analyze → notes → changelog → npm publish with auto-provenance → tag → push back → GitHub Release → PR comments). Downstream `deploy-pages` (main only) + `install-smoke` jobs run conditionally on the release job's `outputs.new_release_published`.
- **API anchor**: Matches the canonical `recipes/ci-configurations/github-actions` workflow byte-for-byte at the job-shape level. Permissions block lifted verbatim.
- **Fits**: Yes. Matches scout-observed pattern of one-step-per-action SHA-pinning, harden-runner first, `permissions: {}` workflow baseline with per-job upgrades. The single-job model is the docs' default; deviations need justification.
- **Tests it enables**: YAML-parse invariants in `tests/release-workflow.test.mjs` (rewritten — see `Open questions → OQ-T1`): `on.push.branches == ['main', 'next']`, `permissions.{contents,issues,pull-requests,id-token}` per-job, no `NPM_TOKEN` env, no `actions/cache`, no `cache:` key on setup-node, every `uses:` SHA-pinned, harden-runner first in every job. Test count likely halves vs. current 519 lines because the job graph shrinks from 5 jobs to 3.
- **Tradeoffs**:
  - **Pro**: Closest to the documented happy-path; reviewer doctrine is "if it deviates from the docs example, write a why-not"; this avoids that bar.
  - **Pro**: One job ownership = `id-token: write` is scoped to the `release` job only, matching current OIDC posture for `publish-npm`.
  - **Pro**: semantic-release exit-code "no release necessary" is a single decision point; downstream jobs read `steps.release.outputs.new_release_published == 'true'`.
  - **Con**: The `release` job now does what was previously three jobs' worth of work (build, publish, push-bump). Job time grows; concurrency lock is held longer. Acceptable since concurrency is per-workflow (one release at a time globally).
  - **Con**: The `release` job needs `contents: write` (for `@semantic-release/git`'s push) AND `id-token: write` (for OIDC). Today these live in different jobs (`push-bump` has `contents: write`, `publish-npm` has `id-token: write`). Combining them widens the OIDC-bearing job's permission surface. Mitigation: documented and scoped; this is the docs' canonical shape.

## Candidate B: Three-job split (`release` → `{deploy-pages, install-smoke}`)

- **Summary**: Preserves the existing `release` → `deploy-pages` + `install-smoke` fanout shape but collapses `build-verify`, `publish-npm`, and `push-bump` into one `release` job that runs `semantic-release`. `deploy-pages` and `install-smoke` stay as separate downstream jobs gated on `release`'s `new_release_published` output.
- **API anchor**: semantic-release docs do not prescribe a multi-job shape; this is a project-specific extension matching the **existing job graph** documented in `docs/specs/release-workflow.md`. Permissions scoped per job: `release` gets `contents: write + id-token: write + issues: write + pull-requests: write`; `deploy-pages` gets `pages: write + id-token: write`; `install-smoke` gets `contents: read`.
- **Fits**: Yes — preserves scout-observed shape (deploy-pages was carved out specifically because the OIDC token for npm and the OIDC token for Pages should not overlap in the same job). The existing spec's AC-013 docs-only gating reuses with minor wording.
- **Tests it enables**: Same YAML invariants as Candidate A, plus the original `needs:` chain assertions (deploy-pages depends on release; install-smoke depends on release). `tests/release-workflow.test.mjs` shrinks less than under A (~350-400 lines vs ~250).
- **Tradeoffs**:
  - **Pro**: Preserves the no-OIDC-token-mixing posture. The existing spec carved this out deliberately; reverting it loses defensive depth.
  - **Pro**: Pages deploy and install-smoke run in parallel post-release — slightly faster wall-clock than serializing them.
  - **Pro**: Easier rollback: if a future change to one of the downstream jobs breaks, the `release` job is unaffected and the bump+publish already happened.
  - **Con**: More YAML; more `if:` predicates to gate jobs on `new_release_published`.
  - **Con**: Cross-job artifact transfer is unnecessary now (semantic-release pushes the bump back; deploy-pages can just checkout the new HEAD), but the job split forces a re-checkout in each downstream job vs. one `release` job that has everything in scope.

## Candidate C (rejected): `cycjimmy/semantic-release-action` wrapper

- **Summary**: Use `cycjimmy/semantic-release-action@<sha>` instead of `npx semantic-release`.
- **API anchor**: `/cycjimmy/semantic-release-action`, 63 snippets, score 65.7. Wraps the same plugin chain; exposes outputs like `new_release_published`, `new_release_version` more ergonomically.
- **Why rejected**:
  - Adds a third-party action under our SHA-pinning + verify-action-shas.mjs surface — one more thing to bump.
  - The canonical docs path is `npx semantic-release` invoked directly with `GITHUB_TOKEN` in env. Adding a wrapper diverges from the docs without a justifying need.
  - Capturing outputs via `npx semantic-release` requires reading the action's env-var output (`NEW_RELEASE_PUBLISHED`, `NEW_RELEASE_VERSION` exported by semantic-release v24+) or parsing JSON output — both are well-documented and simple enough that the wrapper's ergonomic gain is small.
- **Where it would flip**: If the project later needs the wrapper's `extra_plugins` input mechanism for tightly-versioned plugin overrides, revisit. Not today.

## Resolutions to the seven open questions

| OQ | Question | Resolution | Confidence |
|---|---|---|---|
| **OQ-1** | Does `@semantic-release/npm` v12+ support OIDC trusted publishing with `--provenance` end-to-end without `NPM_TOKEN`? | **Yes, confirmed by docs.** `recipes/ci-configurations/github-actions` → §"Trusted publishing and npm provenance" states: "Leveraging trusted publishing with OpenID Connect (OIDC) is recommended … This approach eliminates the need for long-lived secrets like `NPM_TOKEN`" and "npm provenance … is automatically generated for packages published from GitHub Actions when using trusted publishing. This eliminates the need for additional configuration that was previously required." The plugin reads no `NPM_TOKEN` when one is absent and OIDC is configured upstream on npmjs.com. | **High** — docs explicit. |
| **OQ-2** | PR-comment permission scopes for `@semantic-release/github`? | `permissions.contents: write`, `permissions.issues: write`, `permissions.pull-requests: write`, plus `permissions.id-token: write` for OIDC. All four go on the `release` job (Candidate A) or the `release` job (Candidate B). Source: `recipes/ci-configurations/github-actions` → §Basic GitHub Actions Workflow. | **High** — docs verbatim. |
| **OQ-3** | CHANGELOG.md first-generation strategy (no prior tags)? | **Pre-tag `v0.1.0` manually before the first auto-release.** Two reasons: (a) without a prior tag, semantic-release's `analyzeCommits` walks the entire history — current branch has 100+ commits from baseline development, so the first CHANGELOG.md entry would be unreadable; (b) the project is already published at `0.1.0` on npm, so the on-disk version is the right anchor. The pre-tagging step runs once during rollout: `git tag v0.1.0 <commit-of-v0.1.0> && git push origin v0.1.0`. The first auto-release then computes a bump *from* `v0.1.0` based on commits *after* that commit. Recorded in spec's Rollout. Alternative considered: `initialVersion` config — rejected because it lies about history. | **High** — derived from `recipes/release-workflow/publishing-on-distribution-channels` semantics. |
| **OQ-4** | `next → main` direct merge promotion semantics? | **Direct merge works without manual intervention.** semantic-release's channel logic: prereleases on `next` (e.g., `v0.2.0-next.1`, `v0.2.0-next.2`) accumulate on the `@next` dist-tag. When `next` is merged into `main` (fast-forward or merge commit), the next `main` release run sees the same commits + the merge and cuts the right `@latest` version (e.g., `v0.2.0`). Confirmed by `recipes/release-workflow/distribution-channels` example showing exactly this flow. | **High** — docs example pattern matches. |
| **OQ-5** | Pages deploy timing relative to bump-back push? | **Build site inside the `release` job after `semantic-release` returns, then upload + deploy in the downstream `deploy-pages` job** (Candidate B) OR **build + deploy inside the `release` job** (Candidate A). Either way: the site reflects the published version. semantic-release returns success after pushing the bump commit + tag, so the workspace at job-end has the new `package.json` version available to the site build. Pre-bump-deploy is rejected: site would lag by one version every release. | **High** — derived from semantic-release's exit-after-push contract. |
| **OQ-6** | `workflow_dispatch` retention for docs-only and emergency release? | **Retain `workflow_dispatch` only for `mode: docs-only`.** Emergency release path: cherry-pick to a hotfix branch named `main` (or use `git push --force-with-lease` to main if absolutely needed; not recommended) and let the push trigger fire. A `mode: release` `workflow_dispatch` is **rejected**: re-introduces the bump-type choice that the auto-flow is replacing, splits the publish surface in two. Manual emergency fallback stays where it is: the operator-machine `npm publish` path documented in the runbook. | **Medium** — design call, not docs-prescribed. |
| **OQ-7** | Concurrency group key — per-workflow vs per-branch? | **Per-workflow** (current shape: `group: release-${{ github.workflow }}`, `cancel-in-progress: false`). Rationale: semantic-release on `main` and on `next` both push back to their respective branches; with per-branch concurrency, a `next` release run and a `main` release run could race on the GitHub Release API. Per-workflow keeps strict serialization. Wall-clock cost: minimal (releases are infrequent). | **Medium** — design call; semantic-release is silent on concurrency. |

## Recommendation

**Candidate B (three-job split: `release` → {`deploy-pages`, `install-smoke`})** is the recommendation.

**Why over Candidate A:**

1. Preserves the no-OIDC-token-mixing posture documented in the existing approved spec. The existing spec deliberately separates `publish-npm` (id-token: write for npm) from `deploy-pages` (id-token: write for Pages). Collapsing them widens the surface where an OIDC token of one audience is accessible during steps that need the other audience. This is a security property the existing spec earned through review; don't trade it away.
2. The downstream gating on `outputs.new_release_published` is a clean fail-closed shape: no release → no deploy-pages, no install-smoke. Same behavior in Candidate A but expressed via `if:` predicates inside a single job (more `if:` clauses, less obvious).
3. Pages deploy and install-smoke run in parallel post-release — slightly faster than chaining them inside a single job.
4. Closer to the scout-observed shape; less churn in `tests/release-workflow.test.mjs`.

**What would flip the decision to Candidate A:**

- Strong reviewer preference for shape-parity with the canonical docs example (which is single-job).
- A future need to share build artifacts between the release step and a post-release step that the multi-job model would force into an upload-artifact dance.

## Open questions (for `/spec` to resolve)

- **OQ-T1**: Should `tests/release-workflow.test.mjs` be rewritten from scratch alongside the new `release.yml`, or **deleted** in favor of a smaller `tests/semantic-release-workflow.test.mjs` that asserts only the new shape? Recommendation: rewrite in place (preserves test history and the file's documentation value); the spec defines the new invariants.
- **OQ-T2**: Should the spec define `.releaserc.json` (JSON) or `release.config.cjs` (CJS for richer comments + dynamic plugin loading)? semantic-release supports both. Recommendation: `.releaserc.json` — exactly matches the docs' default; YAGNI on the CJS dynamism.
- **OQ-T3**: Pin `semantic-release` to a specific minor (e.g., `24.2.x`) or accept the major (`24.x`)? Recommendation: pin exact per `check-files-diff.mjs:128` (`DEVDEP_RANGE_FORBIDDEN`). Pick the current latest at spec-time.
- **OQ-T4**: Should the spec keep the pre-existing `verify-action-shas.mjs` step as the first `build`-phase guardrail inside the new `release` job? Recommendation: yes — runs before `npx semantic-release` so a Dependabot-introduced SHA drift fails fast.
- **OQ-T5**: Is the runbook §"Pre-publish hygiene sweep" (the four-sweep operator-machine IOC scan) still required when CI is the daily publish path? Recommendation: keep it for the manual-fallback section only; add a note "these sweeps apply to operator workstations, not the hosted runner". The new spec inherits the existing one's framing here.
- **OQ-T6**: Does the spec mandate a `release-notes/<version>.md` file pre-merge, OR does the auto-generated GitHub Release body suffice? Recommendation: drop the convention; GitHub Releases + the auto-generated CHANGELOG.md replace the manually-curated release notes.
- **OQ-T7**: The two open Dependabot PRs (`first-party-actions`, `security-actions`) — close before the rewrite lands so they don't conflict, OR rebase post-merge? Recommendation: rebase post-merge; the SHA bumps are useful.

## Library version baseline (for spec to pin)

| Library | Pin target | Verified |
|---|---|---|
| `semantic-release` | latest 24.x (pick exact at spec time) | docs index covers v24 docs; major shipping today |
| `@semantic-release/changelog` | latest 6.x | docs reference; pin exact |
| `@semantic-release/git` | latest 10.x | docs reference; pin exact |
| `@semantic-release/commit-analyzer` | bundled with `semantic-release` | docs verbatim: "already part of semantic-release and does not need to be installed separately" |
| `@semantic-release/release-notes-generator` | bundled | docs verbatim |
| `@semantic-release/npm` | bundled | docs verbatim |
| `@semantic-release/github` | bundled | docs verbatim |

Spec will pin `semantic-release`, `@semantic-release/changelog`, `@semantic-release/git` as **exact** devDeps to satisfy `check-files-diff.mjs:128`'s `DEVDEP_RANGE_FORBIDDEN` gate. The four bundled plugins ship transitively and don't need direct entries — but if the reviewer wants explicit pinning of those transitives too, the spec can list them; the cost is more devDep entries to maintain, no other downside.
