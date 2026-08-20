# Security reports — unborn-branch-consent-blindness

## unborn-branch-consent-blindness-2026-08-20.md

# Security Review — main (unborn-branch-consent-blindness) — 2026-08-20

## Summary

Overall risk: **LOW**. The change is a net tightening of a consent boundary: `git_commit_guard` previously skipped its detached-HEAD deny, its topology check, and its consent check on a repository's first commit, and now evaluates all three. One MEDIUM finding is a *scope* observation, not a hole — resolving the branch also flips `isAutonomousFeatureLanding()` to true in a state it could never reach before, which omits consent gate C for that workflow. No injection surface is added, no dependency is added, and no secret is touched.

## What was checked

- `git diff HEAD` across 4 modified files (56 changed lines) plus 2 untracked files (spec, test).
- Trust boundary: `git_commit_guard.mjs` `PreToolUse(Bash)` — the decision point for whether Claude may run `git commit` / `git push`.
- Tainted inputs enumerated: the branch name read from `.git/HEAD`; `project.json → git.protected_branches` / `git.branch_pattern` / `git.release_branches` / `git.workflow_model`.
- OWASP A01 (access control), A03 (injection), A04 (insecure design), A08 (integrity), A09 (logging). A02/A05/A06/A07/A10 not reachable from this diff.
- Dependency delta: none (`package.json` and `package-lock.json` untouched).
- Linters: `project.json → lint.cmd` is `null`; no security linter is configured in this project, and none was installed.

## Findings

### [MEDIUM] Resolving the branch silently widens `isAutonomousFeatureLanding()`, which omits consent gate C

- **OWASP**: A04 — Insecure Design (unreviewed change to a consent-gate predicate) | **CWE**: CWE-863 Incorrect Authorization (scope, not correctness)
- **File**: `.claude/hooks/lib/common.mjs:900` (`currentBranch`), consumed at `.claude/hooks/lib/common.mjs:988` (`isAutonomousFeatureLanding`)
- **Evidence**: measured against the pure predicate, holding every other signal fixed (`github-flow`, primary tree, `release_branches: ["main"]`, unprotected):

  ```
  branch=null   (pre-fix resolution on an unborn branch):  false
  branch=feat/x (post-fix resolution on an unborn branch): true
  ```

  and end-to-end in a scratch repo created with `git init -b feat/x` and no commit:

  ```
  branch: feat/x   protected: false   autonomousFeatureLanding: true
  ```

- **Impact**: `seed-tasklist.mjs` passes `ctx.commitConsentRequired = !isAutonomousFeatureLanding()` at tasklist-materialization time. On a github-flow project whose repository is initialized directly onto a feature branch, the `grant-commit` node is now **omitted** where it previously materialized, so that workflow lands its first commit — push and PR included — without the human typing `/grant-commit`. Before this change the predicate was fail-safe false in that state because the branch read as `null`.
- **Why this is MEDIUM and not HIGH**: gate C's omission and the guard's allow decision are keyed on the same property. On an unprotected branch `git_commit_guard` already permits `git commit` and `git push` without consent, so omitting gate C lets nothing past the guard that the guard would otherwise have stopped. The commit-time backstop is intact, and the resulting behavior is what `seed.md` §11 prescribes for a feature branch. The defect is that this reached a new state through a fix whose spec neither gave it an acceptance criterion nor a test.
- **Recommendation**: add an AC and a test pinning `isAutonomousFeatureLanding()` on an unborn branch across the four combinations of {release branch, feature branch} × {protected, unprotected}, so the gate-C materialization decision is held by a test rather than inherited. The spec's `## Design` names the consumer (`isAutonomousFeatureLanding()` degrades the same way) but its AC table stops at `branch_guard` (AC-006). This is a follow-up ticket, not a change to make inside this workflow.

### [LOW] Empty catch swallows the distinction between "no git" and "git failed"

- **OWASP**: A09 — Security Logging and Monitoring Failures | **CWE**: CWE-390 Detection of Error Condition Without Action
- **File**: `.claude/hooks/lib/common.mjs:907`
- **Evidence**:

  ```js
  } catch {}
  return branch || (isInsideWorkTree(cwd) ? 'HEAD' : null);
  ```

- **Impact**: a transient git failure (binary missing, corrupt refs, permission error mid-rebase) resolves to `null` outside a work tree and the guard allows the operation with no log line naming why. This is **pre-existing and unchanged** — the prior implementation swallowed the same errors, and `docs/archive/2026-05-15/branch-aware-git-policy/security.md` already records it as accepted risk. The spec's Non-goals declines to widen or close it.
- **Recommendation**: none for this workflow. If the accepted risk is ever revisited, the fix is a `logLine` on the catch path rather than a behavior change — an unexplained allow is worse than a logged one.

## Dependencies

No packages added, removed, or version-changed in this diff. `package.json` and `package-lock.json` are untouched, so no CVE lookup applies.

## Out of scope / Noted

- **An attacker who can write `.git/HEAD` is already past this boundary.** `symbolic-ref` reads a file inside `.git/`, and anyone who can write there can write `.git/hooks/pre-commit` and get arbitrary local execution without involving this guard. The branch name is therefore not a meaningful attacker-controlled input at this trust boundary, and the same was true of the `rev-parse` read it replaces.
- **The branch name is data, never a command.** Both probes use `execFileSync` with an argv array and no shell, so a hostile ref name cannot inject. Downstream the name reaches `matchAnyGlob` and `new RegExp(projectGet('.git.branch_pattern')).test(branch)` — the branch is the *subject* of that regex, not its source, and the pattern comes from `project.json`. `git` itself rejects the ref characters that would matter. No change from the prior code path.
- **The `'HEAD'` sentinel is preserved deliberately.** Every consumer that special-cases a detached HEAD (`git_commit_guard.branchPolicy`, `branch_guard.decide`, `computeAutonomousFeatureLanding`) keys on the literal string, and the new failure path returns it inside a work tree. A fix that returned `null` there instead would have re-opened the detached-HEAD allow.

