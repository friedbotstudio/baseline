# Runbook — publishing `@friedbotstudio/create-baseline` to npm

The daily path is push-driven: merge a PR into `main` or `next` and the release workflow at [`.github/workflows/release.yml`](../../.github/workflows/release.yml) cuts the right version automatically. The manual fallback (operator-workstation `npm publish`) is retained for emergencies — broken CI, repo migration, an `npm unpublish` follow-up that can't run from CI, or a misconfigured trusted-publisher that needs hands-on diagnosis.

This runbook is operator-actionable from cold. No `@friedbotstudio/create-baseline` familiarity assumed beyond "I have a checkout and `npm` is installed."

---

## Automated path (preferred — the daily release)

### How it works

`semantic-release` reads commits since the last git tag, classifies them by [conventional-commit](https://www.conventionalcommits.org/) prefix, and computes the next version:

| Prefix | Bump |
|---|---|
| `fix:`, `perf:` | patch (`X.Y.Z → X.Y.(Z+1)`) |
| `feat:` | minor (`X.Y.Z → X.(Y+1).0`) |
| `feat!:`, footer with `BREAKING CHANGE:` | major (`X.Y.Z → (X+1).0.0`) |
| `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `ci:` only | **no release** — workflow exits 0 without publishing |

Multiple commit types: the highest bump wins.

### Scope contract (which commits actually move the version)

The version bump is *the version of the package consumers install via `npx @friedbotstudio/create-baseline`*. Not every commit on `main` is a product change — release plumbing, the rendered docs site, and CI maintenance all land in the same repo. The scope segment of each commit message is the seam:

| Scope | Bumps version? | Examples |
|---|---|---|
| `feat:`/`fix:` with no scope (or any product scope) | yes | `feat: add foo skill`, `fix(audit): correct hook count` |
| `feat(release):`, `fix(release):` | no | release workflow, `.releaserc.json`, release scripts |
| `feat(site):`, `fix(site):`, `docs(site):` | no | `site-src/**`, page-relative URL filter, Pages CNAME |
| `feat(ci):`, `feat(actions):`, `chore(actions)(deps):` | no | `.github/workflows/**`, dependabot config, action SHA bumps |
| `build:` | no | build scripts, `prepack`, manifest generation |
| `chore:`, `docs:`, `style:`, `refactor:`, `test:` | no (preset default) | — |

What ships to consumers (and therefore *can* bump the version): `.claude/**`, `src/**`, `bin/**`, `obj/template/**`, and `README.md`. Anything outside those prefixes should carry a non-product scope.

The contract is enforced by `releaseRules` in `.releaserc.json` — scopes `release`, `site`, `ci`, `actions` and type `build` are demoted to `release: false`, which overrides the default rules even for a stray `feat!:` or `BREAKING CHANGE:` footer. The rule is a safety net, not a substitute for discipline: misclassified commits still pollute the changelog and surprise reviewers. When in doubt, ask whether `npx @friedbotstudio/create-baseline` consumers will see a behavioural difference. If no, the scope is non-product.

### Channels

| Branch | Dist-tag | Version shape | Pages redeployed? |
|---|---|---|---|
| `main` | `latest` | `X.Y.Z` | yes |
| `next` | `next` | `X.Y.Z-next.N` | no |

Consumers install via `npm install @friedbotstudio/create-baseline` (stable) or `npm install @friedbotstudio/create-baseline@next` (prerelease). Merging `next` into `main` promotes accumulated prereleases to a single stable release on `@latest`.

### What each run produces

The workflow has three jobs in order: `pre-publish-checks` → `release` → `deploy-pages`.

**`pre-publish-checks` (always runs)** — `npm ci`, `npm audit signatures`, then `npm run publish:check` (precheck dry-run + files-diff + smoke-tarball). The smoke step packs the real tarball, installs it in a tmpdir, and runs the CLI against an empty target — so any tarball that would fail at install time fails *here* before `npm publish` runs. If pre-publish-checks fails, the release job does NOT run and nothing reaches npm.

**`release` (needs pre-publish-checks; skipped on `workflow_dispatch mode=docs-only`)** — when a qualifying commit is present:

1. `npm publish --provenance` to the registry under the selected dist-tag, using OIDC trusted publishing (no `NPM_TOKEN`; SLSA provenance attestation auto-generated).
2. `CHANGELOG.md` updated with the categorized commits.
3. Bumped `package.json` + `CHANGELOG.md` committed and pushed back to the source branch under the `github-actions[bot]` identity.
4. Annotated git tag `vX.Y.Z` pushed.
5. GitHub Release created with release notes (prerelease-flagged on `next`).
6. Comment on each closed PR included in the release, naming the version.

When no commit since the last tag qualifies for a release (every commit's scope is demoted by `releaseRules`, or only `chore`/`docs`/`ci`/etc. landed), semantic-release exits 0 without publishing. The release job succeeds, deploy-pages still runs.

**`deploy-pages` (needs release; main branch only)** — rebuilds `obj/site` from the post-release HEAD of main and deploys to GitHub Pages. Runs on every main push regardless of whether the release job published a new version, so site-src/ changes (including chore commits and docs-only edits) always reach the live site.

### `workflow_dispatch mode=docs-only`

The only dispatch path retained. Triggers a Pages redeploy without cutting a release; useful when the rendered site needs to pick up content from `main` without a version bump. Run from the Actions tab ("Release" workflow → "Run workflow" → pick `docs-only`) or from a terminal: `gh workflow run release.yml --field mode=docs-only`.

---

## One-time prerequisites (before the first auto-release)

Complete each step once. The first run after rollout will fail loudly if any prerequisite is missing.

### 1. Register the npm trusted publisher

On [npmjs.com](https://www.npmjs.com/) → packages → `@friedbotstudio/create-baseline` → Settings → Trusted Publishers → **Add publisher**:

- Owner: `friedbotstudio`
- Repository: `baseline`
- Workflow filename: `release.yml`
- Environment: (leave blank)

Without this, `npm publish` returns `403 OIDC trusted publisher not configured` and the workflow exits non-zero. No silent fallback to anonymous publish exists; the failure is the forcing function.

### 2. Pre-tag `v0.1.0`

`semantic-release` needs a "last release" anchor. The on-disk `package.json` already declares `0.1.0`; anchor it from the repo root:

```
git tag v0.1.0 $(git rev-parse HEAD)
git push origin v0.1.0
```

After this, the first auto-release computes its bump from `v0.1.0` based on commits *after* that tag.

### 3. Set GitHub Pages source

Repo Settings → Pages → Source = **GitHub Actions** (not "Deploy from a branch"). The `deploy-pages` job's OIDC mint requires this.

### 4. Confirm 2FA posture

```
npm whoami
npm profile get tfa
```

The `tfa` setting must read `auth-and-writes`. If it reads `auth-only`, run `npm profile set tfa auth-and-writes` before proceeding. (OIDC trusted publishing is unaffected by 2FA, but the maintainer account must still be hardened — every `npm` write the maintainer makes outside CI passes through this gate.)

### 5. (Optional) Create the `next` branch

Lazy: create when the first prerelease is desired.

```
git checkout -b next
git push -u origin next
```

---

## Verify a release succeeded

From a fresh tmpdir, ~30 seconds after the workflow's `release` job goes green (registry replication):

```
mkdir /tmp/verify-publish && cd /tmp/verify-publish
npx --yes @friedbotstudio/create-baseline@<version> ./target
ls target/.claude target/CLAUDE.md target/.mcp.json
```

The target dir must contain the baseline structure. If `npx` errors with "package not found", wait another 30 seconds (registry replication) and retry.

The `pre-publish-checks` job already runs an equivalent install + materialize + hash-verify pass against the locally-packed tarball *before* `npm publish` fires — so a broken tarball cannot reach the registry in the first place. This manual step is for operator confidence and post-incident verification of registry replication.

---

## Branch protection migration (deferred)

v1 runs against an unprotected `main`. The default `GITHUB_TOKEN` provided by GitHub Actions has the `contents: write` scope the workflow needs to push the bump commit + tag back to the source branch.

When branch protection lands on `main` (required reviews, required status checks, restricted pushers), the default token will be rejected by `@semantic-release/git`'s push step and the workflow will fail. Migration path:

1. Provision a GitHub App named `release-bot` with `contents: write` and `metadata: read` on this repository only.
2. Add the App as an exempt actor on the branch protection rule.
3. Generate an installation access token in the workflow (e.g., via `actions/create-github-app-token@<sha>`) and replace `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on the semantic-release step with the App token.

The migration is a single PR; tracked as a follow-up.

---

## Manual fallback

Use this path only when CI is unavailable (workflow broken, repo migration, post-72h `unpublish` follow-up that needs operator credentials). Every other release goes through the automated path.

### Step 1 — Bump the version

Edit `package.json` directly. Change `"version": "X.Y.Z"` to the new version per semver. `npm version <bump>` is the conventional tool but requires a clean git working tree, which this project does not maintain; edit by hand, save, move on.

### Step 1.5 — Pre-publish hygiene sweep

Workstation-only. The hosted CI runner is a fresh Ubuntu image per run and does not need these sweeps. Skipping this step is what made the TanStack incident catastrophic — the malicious tarball was published from a developer machine that had been silently rooted.

Run each check in order. Any non-clean result is a **STOP**: rotate credentials, investigate, and do not publish until the cause is understood.

**Sweep 1 — dead-man's-switch indicators.**

The TanStack attack installed a persistent token-monitor daemon at three sanctioned operator-machine paths (one per OS). Snyk's published forensics list them exactly:

```
ls ~/.local/bin/gh-token-monitor.sh \
   ~/.config/systemd/user/gh-token-monitor.service \
   ~/Library/LaunchAgents/com.user.gh-token-monitor.plist \
   2>/dev/null
```

If any file is listed: STOP. Rotate every credential the affected account holds (npm, GitHub, AWS, Slack, anything in `~/.npmrc` / `~/.gitconfig` / `~/.aws/credentials`). Do not run `npm publish`. Treat the host as compromised until evidence says otherwise.

**Sweep 2 — credential leakage in Claude Code project files.**

Long-running Claude Code sessions occasionally cache shell output or partial files that contain credentials. Snyk's published IOC scan looks for credential-prefixed substrings inside `~/.claude/projects/*.jsonl`:

```
grep -l 'sk-\|ghp_\|AKIA\|xoxb-' ~/.claude/projects/*.jsonl 2>/dev/null
```

The four prefixes: `sk-` (OpenAI/Anthropic API keys), `ghp_` (GitHub personal access tokens), `AKIA` (AWS access keys), `xoxb-` (Slack bot tokens). If `grep` lists any file: STOP. Redact the offending jsonl (or delete the project's `~/.claude/projects/<id>/` directory) AND rotate the credentials that leaked.

**Sweep 3 — npm 2FA posture.**

```
npm whoami
npm profile get tfa
```

The `tfa` setting must read `auth-and-writes`. If it reads `auth-only`, enable writes-too-gated 2FA via `npm profile set tfa auth-and-writes` before continuing.

**Sweep 4 — `~/.npmrc` operator defaults.**

The shipped `obj/template/.npmrc` materializes `ignore-scripts=true` and `min-release-age=7` for downstream consumers. The operator's own `~/.npmrc` should mirror these defaults (and add `audit-level=moderate`) before any publish that touches third-party deps:

```
ignore-scripts=true
min-release-age=7
audit-level=moderate
```

Only after all four sweeps come up clean, proceed to Step 2.

### Step 2 — Precheck

```
npm run publish:check
```

What this runs (in order):

1. `publish:precheck` — `npm publish --dry-run` (executes `prepack` lifecycle, surfaces any policy/build error).
2. `publish:files-diff` — verifies `package.json → files:` declared prefixes match what `npm pack` would actually emit.
3. `publish:smoke` — packs the real tarball, installs it into a clean tmpdir, runs `@friedbotstudio/create-baseline` against an empty target dir, verifies the materialized baseline's manifest hashes match.

Expected output on green: `PASS: precheck, files-diff, smoke (3 of 3)`.

On `FAIL: <step>`, read the captured stderr above the FAIL line and reconcile before continuing.

### Step 3 — Tag (optional, for pre-release)

For the latest stable release, `npm publish` defaults to `--tag latest`; no extra flag needed.

For a one-off pre-release (e.g., `0.2.0-beta.1` outside the auto `next` channel):

```
npm publish --access public --tag beta
```

### Step 4 — Publish

```
npm publish --access public
```

You will be prompted for your npm 2FA code. Expected output: a summary line ending with `+ @friedbotstudio/create-baseline@<version>` and HTTP/200.

### Step 5 — Verify the install resolves

Same as the automated-path verification above.

---

## Rollback

> **What provenance proves and does not prove.** If the broken version carries `npm publish --provenance` attestation, that proves the tarball was built by the named GitHub Actions workflow on the named commit. It does **not** prove the build was authorized to ship, nor that the build's own runtime was clean. Both Snyk's TanStack writeup and Adnan Khan's "Most Devious Backdoor" research are explicit: valid SLSA L3 provenance attests the build, not the authorization. Rollback decisions should not lean on provenance as proof of legitimacy.

### Within 72 hours of publish: unpublish

```
npm unpublish @friedbotstudio/create-baseline@<broken-version>
```

This **removes** the version. Anyone who already ran `npm install @friedbotstudio/create-baseline@<broken-version>` keeps the broken copy locally, but new installs cannot retrieve it. Use this when the broken version has had zero or near-zero downloads.

### After 72 hours: deprecate

```
npm deprecate @friedbotstudio/create-baseline@<broken-version> "Broken release; install <fixed-version> instead. See <link>."
```

The message string is shown on install. Keep it short, name the fixed version, and include a link to the issue if you have one.

### Version-bump strategy for the fix

A broken-then-fixed release follows this pattern (auto-flow):

1. Push a `fix:` commit to `main` (or `next`). semantic-release computes the next patch from the broken version (NOT from the version before the break — `0.1.1` is poisoned in the registry even if unpublished).
2. The workflow publishes `0.1.2` and tags it.
3. If the broken version is still inside the 72h `unpublish` window, run `npm unpublish @friedbotstudio/create-baseline@0.1.1` AFTER `0.1.2` is live (so users have a working version to fall back to).

### Order of operations under pressure

When a published version is found broken and users are reporting issues:

1. **Communicate first**: post the issue + ETA to the repo's issues link.
2. **Deprecate immediately** if >72h (even if a fix is coming) — this stops new users from hitting the bug.
3. **Push the `fix:` commit**; the workflow does the rest.
4. **Verify the fix install resolves** (manual Step 5 above).
5. **Unpublish the broken version** if within 72h.
6. **Post resolution** in the same channel as step 1.

---

## CI invariants (live)

These were "future" in the prior runbook revision; the auto-flow makes them live.

**Rule 1 — third-party Actions are pinned to a 40-character commit SHA, never to tag refs.**

The `tj-actions/changed-files` compromise (CVE-2025-30066) used a mutable git tag to retroactively point published releases at an attacker-controlled commit. Every prior consumer that had pinned to `@v45` (or even `@v45.0.7`) silently picked up the malicious code on their next run. Pin to the SHA:

```
- uses: tj-actions/changed-files@<40-char-commit-sha>  # v45.0.7
```

The tag goes in a trailing comment for human readability; the SHA is the authoritative pin. `scripts/verify-action-shas.mjs` runs as a step inside the `release` job and fails the workflow on drift; `tests/release-workflow.test.mjs` also asserts the SHA-pin shape statically.

**Rule 2 — release workflows do not use `actions/cache`, and `setup-*` actions omit the `cache:` key.**

Adnan Khan's "Most Devious Backdoor" research demonstrated valid SLSA L3 provenance attesting a build whose own dependencies were poisoned through GitHub Actions cache restoration. The TanStack worm used the same vector. Provenance attests build, not authorization — the build was real; what was poisoned was the runtime that fed it.

In `release.yml`:

```
- uses: actions/setup-node@<sha>
  with:
    node-version: '22'
    # NOTE: no `cache:` key. setup-node@v4+ rejects `cache: false` at runtime
    # with "Caching for 'false' is not supported"; the canonical way to disable
    # caching is to OMIT the key entirely.
# - uses: actions/cache@<sha>            FORBIDDEN in release workflows
```

`tests/release-workflow.test.mjs` enforces both invariants statically: the file must not contain the substring `actions/cache`, and no `setup-*` step may declare a `cache:` key.

**Rule 3 — `step-security/harden-runner` runs as the first step of every release job in `audit` mode.**

Audit mode logs all egress to StepSecurity's portal without blocking. The TanStack analysis credits Harden-Runner with detecting cache-poisoning egress on a customer's runner before exfiltration completed. Block mode is the v2 evaluation candidate; the v1 posture is audit-only because we do not yet have a vetted egress allowlist.

---

## Reference — what gets published

The published tarball contains exactly the paths declared in `package.json → files:`:

- `bin/cli.js` — the CLI entry point.
- `src/cli/**` — the CLI's runtime source.
- `src/*.template.*` — pristine ship-time templates (CLAUDE.md, seed.md, project.json, settings.json, .mcp.json, swarm-worker agent).
- `src/agents/swarm-worker.template.md` — the only baseline subagent template.
- `src/memory/**` — canonical memory file templates.
- `obj/template/**` — the prepack-built template tree (`.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`, `manifest.json`).
- `README.md` — the user-facing readme.

Anything outside these prefixes is excluded by npm pack. `docs/` (except `docs/init/seed.md` inside `obj/template/`), `tests/`, `site-src/`, `node_modules/`, `.git/`, `.claude/state/`, and the dev-time `.claude/` tree are all excluded.

The `prepack` hook (`bash scripts/build-template.sh`) rebuilds `obj/template/` from `src/` + `.claude/` every time `npm pack` or `npm publish` runs. `audit-baseline` runs first; the build aborts if any audit invariant is violated.
