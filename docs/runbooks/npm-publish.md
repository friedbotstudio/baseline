# Runbook — publishing `create-baseline` to npm

Operator-actionable from cold. No `create-baseline` familiarity assumed beyond "I have a checkout and `npm` is installed."

## Prerequisites

- **npm account** with publish rights on `create-baseline`. Verify: `npm whoami` returns your username. If not: `npm login`.
- **Two-factor authentication** is enabled on your npm account (npm enforces this for publish on packages with prior versions; for the first publish it's recommended).
- **Working directory** is the repo root. Verify: `pwd` ends in `setup_exp` (or wherever you cloned), `ls package.json` succeeds.
- **Local install present**: `ls node_modules >/dev/null 2>&1` succeeds. If not: `npm ci` first.
- **No uncommitted scratch state** in `obj/` that you wouldn't want shipped. The `prepack` hook rebuilds `obj/template/` from `src/` + `.claude/` cleanly, but if you've manually edited `obj/template/` directly, those edits will be overwritten — which is the correct behavior.

## Automated path (preferred)

The day-to-day release path is the manually-triggered GitHub Actions workflow at [`.github/workflows/release.yml`](../../.github/workflows/release.yml). Trigger it from the repo's Actions tab (pick "Release", click "Run workflow", choose `major`, `minor`, or `patch`) or from a terminal: `gh workflow run release.yml --field bump_type=patch`. The workflow runs a four-job pipeline (build-verify → publish-npm → {deploy-pages, push-bump, install-smoke}) under SLSA L3 provenance via npm trusted publishing over OIDC. No long-lived `NODE_AUTH_TOKEN` is involved; the workflow is a registered trusted publisher on npmjs.com and mints a short-lived publish credential per run.

The hygiene sweeps in Step 1.5 below are operator-machine checks: they scan a developer workstation for indicators of compromise that would corrupt a manual publish. They do not apply to the CI runner, which is a hosted GitHub-Actions Ubuntu image rebuilt per run. The sweeps remain mandatory for any *manual* publish from a workstation.

Three one-time human prerequisites must be completed before the workflow's first run can succeed; see [`docs/specs/release-workflow.md`](../specs/release-workflow.md) → Rollout for the exact steps (register the trusted publisher on npmjs.com, set Pages source to "GitHub Actions", confirm `auth-and-writes` 2FA).

The rest of this runbook below is the **manual fallback**. Use it when the workflow is unavailable (broken, repo migration, an `npm unpublish` follow-up that cannot run from CI) or for diagnostic dry runs from an operator workstation. Every Future-CI invariant in §"Future-CI invariants" near the bottom is enforced by `tests/release-workflow.test.mjs` against the workflow YAML.

---

## Step 1 — Bump the version

Edit `package.json` directly. Find the line:

```
"version": "0.1.0",
```

Change `0.1.0` to the new version per semver:

- **Patch** (`0.1.0 → 0.1.1`) — bug fixes only; no API changes.
- **Minor** (`0.1.0 → 0.2.0`) — new features; backwards-compatible API additions.
- **Major** (`0.1.0 → 1.0.0`) — breaking changes to the CLI surface or the materialized baseline shape.

`npm version <bump>` is the conventional tool for this, but it requires a clean git working tree, which this project does not maintain. **Edit by hand**, save, move on.

Optional: record the version's rationale in `docs/release-notes/<version>.md` (create the file). Currently the `docs/release-notes/` directory does not exist; this is a soft convention, not a release blocker.

## Step 1.5 — Pre-publish hygiene sweep

Before `npm publish` ever runs, sweep the operator machine for known supply-chain indicators of compromise (IOCs). Skipping this step is what made the TanStack incident catastrophic — the malicious tarball was published from a developer machine that had been silently rooted.

Run each check in order. Any non-clean result is a **STOP**: rotate credentials, investigate, and do not publish until the cause is understood.

**Sweep 1 — dead-man's-switch indicators.**

The TanStack attack installed a persistent token-monitor daemon at three sanctioned operator-machine paths (one per OS). Their presence on a developer machine that did not deliberately install them is a strong signal of credential-stealer activity. Snyk's published forensics list these paths exactly; we vendor them so the runbook stays actionable cold:

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

The four prefixes are: `sk-` (OpenAI/Anthropic API keys), `ghp_` (GitHub personal access tokens), `AKIA` (AWS access keys), `xoxb-` (Slack bot tokens). If `grep` lists any file: STOP. Redact the offending jsonl (or delete the project's `~/.claude/projects/<id>/` directory) AND rotate the credentials that leaked. The published tarball does not ship `~/.claude/`, but credentials a model has already seen are credentials the operator must treat as breached.

**Sweep 3 — npm 2FA posture.**

The TanStack incident chain bypassed weak 2FA settings. npm offers three TFA modes: `disabled`, `auth-only`, and `auth-and-writes`. Only the third one gates publish on a token challenge. Verify:

```
npm whoami
npm profile get tfa
```

The `tfa` setting must read `auth-and-writes`. If it reads `auth-only` (the npm default), enable writes-too-gated 2FA via `npm profile set tfa auth-and-writes` before continuing. Single-publish bypasses ("npm token create --read-only") are out of scope here.

**Sweep 4 — `~/.npmrc` operator defaults.**

The shipped `obj/template/.npmrc` materializes `ignore-scripts=true` and `min-release-age=7` for downstream consumers of `create-baseline`. The operator's own `~/.npmrc` should mirror these defaults (and add `audit-level=moderate`) before any publish that touches third-party deps:

```
ignore-scripts=true
min-release-age=7
audit-level=moderate
```

This is recommended, not required by the runbook. The hardened defaults reduce blast radius from supply-chain attacks on the operator's own development tree.

Only after all four sweeps come up clean, proceed to Step 2.

## Step 2 — Precheck

```
npm run publish:check
```

What this runs (in order):

1. `publish:precheck` — `npm publish --dry-run` (executes `prepack` lifecycle, surfaces any policy/build error).
2. `publish:files-diff` — verifies `package.json → files:` declared prefixes match what `npm pack` would actually emit (symmetric diff; flags both declared-not-packed and packed-not-declared).
3. `publish:smoke` — packs the real tarball, installs it into a clean tmpdir, runs `create-baseline` against an empty target dir, verifies the materialized baseline's manifest hashes match `obj/template/manifest.json`.

**Expected output on green**: a single line `PASS: precheck, files-diff, smoke (3 of 3)`.

**If you see `FAIL: <step>`**: do NOT publish. Read the captured stderr above the FAIL line. Common causes:

- `FAIL: precheck` — `prepack` failed; usually `audit-baseline` caught drift in `src/` or `.claude/`. Fix the drift; re-run.
- `FAIL: files-diff` — `package.json → files:` declares a prefix that has no packed files (`DECLARED-NOT-PACKED:`), or `npm pack` emits a file outside any declared prefix (`PACKED-NOT-DECLARED:`). Reconcile both lists; re-run.
- `FAIL: smoke` — the installed tarball failed to materialize a valid baseline. Stderr will name a missing file (often under `obj/template/`). The `prepack` step probably skipped or partially built; investigate `scripts/build-template.sh`.

Time budget: ~30–45 seconds total on a warm machine (cold node_modules can add 1–2 minutes for the `npm install` inside the smoke step).

## Step 3 — Tag (optional, for non-default releases)

For the latest stable release, you DO NOT need a tag — `npm publish` defaults to `--tag latest`.

For a pre-release (e.g., `0.2.0-beta.1`), publish with `--tag beta`:

```
npm publish --access public --tag beta
```

This makes the version installable via `npm install create-baseline@beta` without disturbing the `latest` tag.

## Step 4 — Publish

For the first publish (the package is new on npm):

```
npm publish --access public
```

`--access public` is required for scoped packages and recommended for first publishes to make the public/private intent explicit. For an unscoped package like `create-baseline` it's defensive but harmless.

You will be prompted for your npm 2FA code (if 2FA is enabled).

**Expected output**: a npm summary line ending with `+ create-baseline@<version>` and HTTP/200 status.

## Step 5 — Verify the install resolves

From a fresh tmpdir:

```
mkdir /tmp/verify-publish && cd /tmp/verify-publish
npx --yes create-baseline@<version> ./target
ls target/.claude target/CLAUDE.md target/.mcp.json
```

The target dir should contain the baseline structure. If `npx` errors with "package not found", wait 30 seconds (registry replication) and retry.

## Step 6 — Rollback (when something is broken post-publish)

> **What provenance proves and does not prove.** If the broken version carries `npm publish --provenance` attestation, that proves the tarball was built by the named GitHub Actions workflow on the named commit. It does **not** prove the build was authorized to ship, nor that the build's own runtime was clean. Both Snyk's TanStack writeup and Adnan Khan's "Most Devious Backdoor" research are explicit: valid SLSA L3 provenance attests the build, not the authorization. Rollback decisions should not lean on provenance as proof of legitimacy.


### Within 72 hours of publish: unpublish

npm allows `unpublish` for a window of 72 hours after a version was first published:

```
npm unpublish create-baseline@<broken-version>
```

This **removes** the version. Anyone who already ran `npm install create-baseline@<broken-version>` keeps the broken copy locally, but new installs cannot retrieve it. Use this when the broken version has had **zero or near-zero downloads** and you want it erased.

### After 72 hours: deprecate

Unpublish is no longer available. Instead, mark the version deprecated so the npm CLI warns on install:

```
npm deprecate create-baseline@<broken-version> "Broken release; install <fixed-version> instead. See <link>."
```

The message string is shown to anyone installing the deprecated version. Keep it short, name the fixed version, and include a link to the release notes / issue if you have one.

### Version-bump strategy for the fix

A broken-then-fixed release follows this pattern:

1. **Bump patch from the broken version**, NOT from the version before the break. Example: if `0.1.0` was clean and `0.1.1` is broken, the fix ships as `0.1.2` (not `0.1.1` again — `0.1.1` is poisoned in the public registry even if unpublished).
2. Fix the bug in code.
3. Run `npm run publish:check` again to confirm green.
4. `npm publish --access public`.
5. Verify install (Step 5).
6. If the broken version is still in the 72h window, run `npm unpublish` AFTER the fix is live (so users have a working version to fall back to).

### Order of operations under pressure

When a published version is found broken and users are reporting issues:

1. **Communicate first**: post the issue + ETA wherever the project's users gather (no project-specific channel today; tell them via the repo's `README.md` issues link).
2. **Deprecate immediately** if >72h (even if a fix is coming) — this stops new users from hitting the bug.
3. **Bump and fix** locally.
4. **Re-run `npm run publish:check`**.
5. **Publish the fix**.
6. **Unpublish the broken version** if within 72h.
7. **Post resolution** in the same channel as step 1.

## Future-CI invariants

This project does not yet run a CI pipeline. When one is introduced, these rules bind before the first release workflow lands. They are recorded here so the runbook stays the single source of truth for publish discipline.

**Rule 1 — third-party Actions MUST be pinned to a 40-character commit SHA, never to tag refs.**

The `tj-actions/changed-files` compromise (CVE-2025-30066) used a mutable git tag to retroactively point published releases at an attacker-controlled commit. Every prior consumer that had pinned to `@v45` (or even `@v45.0.7`) silently picked up the malicious code on their next run. Pin to the SHA:

```
- uses: tj-actions/changed-files@<40-char-commit-sha>  # v45.0.7
```

The tag goes in a trailing comment for human readability; the SHA is the authoritative pin. Dependabot can manage SHA bumps via `dependabot.yml` once CI exists.

**Rule 2 — release workflows MUST set `cache: false` on `setup-*` actions and MUST NOT use `actions/cache`.**

Adnan Khan's "Most Devious Backdoor" research demonstrated valid SLSA L3 provenance attesting a build whose own dependencies were poisoned through GitHub Actions cache restoration. The TanStack worm used the same vector: cached `pnpm` state seeded a malicious dependency into the build that produced the published tarball. Provenance attests build, not authorization — the build was real; what was poisoned was the runtime that fed it.

In a release workflow:

```
- uses: actions/setup-node@<sha>
  with:
    node-version: '22'
    cache: false                       # MUST be false on release builds
# - uses: actions/cache@<sha>            FORBIDDEN in release workflows
```

A non-release workflow (CI for PRs) may use caches; the rule binds only the workflow that runs `npm publish`.

**Rule 3 — egress monitoring as an evaluation candidate.**

[`step-security/harden-runner`](https://github.com/step-security/harden-runner) provides runtime egress allowlisting + monitoring for GitHub Actions runners. The TanStack analysis credits Harden-Runner with detecting the cache-poisoning egress on a customer's runner before exfiltration completed. We do not adopt it in this workflow (there is no CI yet), but it is the recommended starting point when CI lands.

## Reference — what gets published

The published tarball contains exactly the paths declared in `package.json → files:`:

- `bin/cli.js` — the CLI entry point.
- `src/cli/**` — the CLI's runtime source.
- `src/*.template.*` — the pristine ship-time templates (CLAUDE.md, seed.md, project.json, settings.json, .mcp.json, swarm-worker agent, memory templates).
- `src/agents/swarm-worker.template.md` — the only baseline subagent template.
- `src/memory/**` — the 6 canonical memory file templates.
- `obj/template/**` — the prepack-built template tree (`.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`, `manifest.json`).
- `README.md` — the user-facing readme.

Anything outside these prefixes is excluded by npm pack. `docs/` (except `docs/init/seed.md` inside `obj/template/`), `tests/`, `site-src/`, `node_modules/`, `.git/`, `.claude/state/`, and the dev-time `.claude/` tree are all excluded.

The `prepack` hook (`bash scripts/build-template.sh`) rebuilds `obj/template/` from `src/` + `.claude/` every time you run `npm pack` or `npm publish`. Audit-baseline runs first; the build aborts if any audit invariant is violated.
