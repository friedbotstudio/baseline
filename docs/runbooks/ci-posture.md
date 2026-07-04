# Runbook — CI/secrets posture

When to use this: you are activating the baseline's secrets-scanning and branch-protection posture in this repo or a consumer project, applying branch protection, opting a project out, or dealing with a blocked commit.

## Quick start (one command)

```bash
# Point git at the tracked hooks directory. Human-run, once per clone —
# Claude Code never runs `git config` (CLAUDE.md Art. VII hard-blocks it).
git config core.hooksPath .githooks
```

From that point every `git commit` runs the gitleaks gate. Install the scanner if you don't have it:

```bash
brew install gitleaks   # other platforms: https://github.com/gitleaks/gitleaks#installing
```

## What each artifact does

| Artifact | Role |
|---|---|
| `.githooks/pre-commit` | Pre-commit entry point. Resolves the repo root and delegates to `require-gitleaks.sh`. |
| `scripts/ci/require-gitleaks.sh` | The gate. gitleaks absent → commit hard-fails (exit 1, names the install command). Present → scans the staged diff (`gitleaks git --pre-commit --staged --redact`). |
| `scripts/ci/low-risk-classifier.mjs` | Classifies a changed-path list for auto-merge. `low_risk: true` only when every path is prose (`docs/**`, `site-src/**`, `README.md`) and nothing hits the NEVER-list (enforcement hooks, `.github/**`, `scripts/ci/**`, dependency manifests, licence/SBOM, governance docs). JSON on stdout; exit 0 low-risk, 1 otherwise. |
| `.github/branch-protection/main.json` | Branch protection as reviewable config, not clickops. This repo pins the `pre-publish-checks` context; consumers receive a placeholder variant to fill in. |
| `scripts/ci/apply-branch-protection.mjs` | Applies that config via `gh api` — after asserting every required context was observed green on the live branch head. Refuses placeholder configs. |
| `.github/workflows/auto-merge.yml` | Repo-local (not shipped). Runs a PR-triggered `pre-publish-checks` twin (release.yml is push-only, so PRs need one) and enables `gh pr merge --auto --squash` for classifier-approved PRs. |

## Applying branch protection

Prerequisites: `gh` authenticated with admin on the repo; a green run on the branch head.

```bash
# Preview — validates the config and the subset assertion, writes nothing
node scripts/ci/apply-branch-protection.mjs .github/branch-protection/main.json --dry-run

# Apply
node scripts/ci/apply-branch-protection.mjs .github/branch-protection/main.json
```

The applier fails loud when a required context has not reported green on the branch head — that assertion is what keeps a typo'd context name from making the branch unmergeable.

`enforce_admins` is deliberately `false`: this repo runs `direct-to-main`, so the admin's own pushes must not be blocked by checks that only run post-push. Flip it to `true` if the repo ever moves to a PR-only (`github-flow`) model.

## Consumer opt-out

The posture ships default-on with installs (`ci_posture.enabled: true` in `project.json`).

```bash
# Skip it at install time: no artifacts delivered, knob stamped false
npx @friedbotstudio/create-baseline ./your-project --no-ci-posture
```

Upgrades respect the knob: an opted-out project (`ci_posture.enabled: false`) never has posture artifacts re-delivered, pruned, or prompted about — your own hooks at those paths stay untouched. To opt out after the fact, set the knob to `false` and delete the delivered files; to opt back in, set it `true` and re-run `create-baseline upgrade`.

## Blocked commit / emergency bypass

A commit blocked by the gate means either gitleaks is missing (install it) or it found a secret in the staged diff (remove the secret — that is the gate doing its job).

Human-only escape hatch for a genuine false positive you cannot resolve right now:

```bash
git -c core.hooksPath= commit   # bypasses the hook for this one invocation
```

Prefer a `.gitleaksignore` entry or a `gitleaks:allow` comment for recurring false positives; the bypass leaves no scan at all.

## Escalation

Gate misbehavior in this repo → `/rca` and, if the gate itself must change, a workflow touching `scripts/ci/**` (NEVER-list: such PRs never auto-merge). Consumer-side issues → check `ci_posture.enabled` first, then the shipped artifact hashes via `create-baseline doctor`.
