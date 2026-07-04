# Security reports — erp-portables-slice-j

## erp-portables-slice-j-2026-07-04.md

# Security Review — main (erp-portables-slice-j working tree) — 2026-07-04

## Summary

The slice adds a secrets-scanning pre-commit gate, an auto-merge workflow with a low-risk classifier, a branch-protection applier, and CLI delivery seams. Overall risk: **MEDIUM** — one defense-in-depth gap in the auto-merge workflow (classifier evaluated from the PR head, not the trusted base); no injection, no secrets, no dependency changes.

## Findings

### [MEDIUM] Auto-merge classifier runs the PR's own copy of itself
- **OWASP**: A08 - Software and Data Integrity Failures | **CWE**: CWE-829
- **File**: .github/workflows/auto-merge.yml:66 (classify-and-enable checkout)
- **Evidence**:
  ```yaml
  - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
  ...
  run: |
    if gh pr diff "$PR_NUMBER" --name-only \
      | node scripts/ci/low-risk-classifier.mjs --stdin; then
  ```
- **Impact**: `actions/checkout` on a `pull_request` event checks out the PR merge ref, so a PR that edits `scripts/ci/low-risk-classifier.mjs` is classified by its own (attacker-controlled) classifier — the NEVER-list is evaluated by the code it is supposed to police. Exploitability today is LOW-leaning: fork PRs get a read-only `GITHUB_TOKEN` (the `gh pr merge --auto` step fails), and same-repo PR authors already hold write access, so there is no privilege escalation on current settings. The gap matters if repo/org token policy ever loosens or the trigger is changed to `pull_request_target`.
- **Recommendation**: In the `classify-and-enable` job, check out the trusted base instead of the PR head — `with: ref: ${{ github.event.pull_request.base.sha }}` — so the classifier and NEVER-list always come from the target branch. (The `pre-publish-checks` job legitimately builds the PR head; only classification must be trusted-code.)

### [LOW] Classifier trusts git-normalized paths
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-20
- **File**: scripts/ci/low-risk-classifier.mjs:18
- **Evidence**:
  ```js
  { name: 'enforcement hooks (.githooks/**)', matches: (p) => p.startsWith('.githooks/') },
  ```
- **Impact**: Prefix matching assumes repo-relative normalized paths (no `./`, no `..`). `git`/`gh pr diff --name-only` guarantee this, so the assumption holds for the CI consumer; a future caller passing raw user input could bypass prefix rules with `./CLAUDE.md`. Speculative — no such caller exists in this diff.
- **Recommendation**: None required now; if a non-git caller is ever added, normalize paths before matching.

### [LOW] Opt-out knob read is fail-open toward delivery
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-636
- **File**: src/cli/ci-posture.js:28
- **Evidence**:
  ```js
  } catch {
    return true;
  }
  ```
- **Impact**: A corrupt/unreadable consumer `project.json` on upgrade makes the merge treat CI posture as enabled and attempt delivery into an opted-out project. Worst case is a customized-file prompt (the consumer's own hooks hash-mismatch and route to the prompt tier), never a silent overwrite — threeWayMerge's customized path stages or prompts, it does not clobber.
- **Recommendation**: Accepted as designed (default-on posture); the prompt tier is the backstop.

### [LOW] `enforce_admins: false` in branch protection
- **OWASP**: A05 - Security Misconfiguration | **CWE**: CWE-1188
- **File**: .github/branch-protection/main.json:7
- **Evidence**:
  ```json
  "enforce_admins": false,
  ```
- **Impact**: Admins (the solo maintainer) bypass required checks on direct pushes.
- **Recommendation**: Deliberate and recorded (spec decision D1): this repo runs `direct-to-main`; enforcing admins would brick the maintainer's sanctioned push flow. Revisit if `git.workflow_model` moves to `github-flow`.

## What was checked

- Injection (A03): workflow `run:` blocks use env-var indirection for `PR_NUMBER`; changed paths flow via stdin (`--stdin`), never shell-interpolated; `execFileSync` (no shell) throughout the applier; the pre-commit hook quotes `git rev-parse --show-toplevel`.
- Secrets hygiene: no tokens/keys added; `GITHUB_TOKEN` referenced only via the `secrets` context into `env`.
- Access control (A01): workflow permissions are least-privilege per job (`contents: read` on the gate job; `write` only where auto-merge needs it); top-level `permissions: {}`.
- Integrity (A08): all `uses:` pinned to 40-char SHAs identical to release.yml's; `scripts/verify-action-shas.mjs` walks every workflow file, so the new workflow is covered by the existing CI drift check.
- Supply chain: no new dependencies; `npm audit --omit=dev` — 0 vulnerabilities.
- Delivery seams: opt-out filter + empty-dir prune touch only `CI_POSTURE_PATHS`; merge-time skip makes posture paths invisible (no deliver/prune/prompt) for opted-out targets.

## Dependencies

None added or updated in this diff.

## Out of scope / Noted

- The gitleaks binary itself is trusted from the developer's PATH (standard for local hooks); a hostile local PATH is outside this threat model.
- `pre-publish-checks` in auto-merge.yml intentionally executes PR-head code (`npm ci`, `publish:check`) with `contents: read` — the standard CI trade-off; harden-runner egress audit applies.

