# Security reports — git-workflow-topology-model

## git-workflow-topology-model-2026-06-04.md

# Security Review — git-workflow-topology-model — 2026-06-04

## Summary

Overall risk: **LOW**. The change adds branch-topology enforcement to `git_commit_guard` (a security *control*, not a new attack surface). It is fail-secure, composes correctly with the existing consent gate, and introduces no injection or bypass that is reachable in the threat model. No CRITICAL/HIGH/MEDIUM findings; three LOW/NOTED observations below. Scope: the diff for this branch (167 insertions, 28 deletions across 13 files); the security-relevant code is `.claude/hooks/git_commit_guard.mjs` + `.claude/hooks/lib/common.mjs`.

## Findings

### [LOW] Worktree carve-out is bounded — not a topology bypass
- **OWASP**: A04 Insecure Design (analyzed, not violated) | **CWE**: CWE-693 (Protection Mechanism Failure — assessed)
- **File**: `.claude/hooks/git_commit_guard.mjs:217-231`, `.claude/hooks/lib/common.mjs:809-818`
- **Evidence**:
  ```js
  isPrimary: isPrimaryWorkTree(),   // guard skips topology in a linked worktree
  // common.mjs: gitDir === commonDir ? primary : linked
  ```
- **Impact (analyzed)**: A linked-worktree commit is exempt from topology enforcement. The concern is "commit off-release inside a worktree, then land it on `main` to dodge `direct-to-main`." This does **not** materialize: `swarm_merge.mjs` lands worktree changes by `git apply`-ing the *diff* onto the primary tree and the actual primary-tree `/commit` (Phase 11) **is** topology-enforced; and the only manual route (committing on a feature branch, then `git merge --ff-only` onto the release line) is precisely the **sanctioned** `direct-to-main` remediation the guard itself prints — history still lands on the release line. The carve-out exists to avoid false-blocking dispatch; the primary-tree `/commit` remains the single enforced choke point.
- **Recommendation**: No code change. Keep the carve-out scoped to linked worktrees only (it is). Documented in seed.md Art. VII + the annex.

### [LOW] Config-driven glob → regex (ReDoS surface, trusted input)
- **OWASP**: A03 Injection (assessed) | **CWE**: CWE-1333 (ReDoS)
- **File**: `.claude/hooks/lib/common.mjs:822-825` (`parsePushBranches` regex), `matchAnyGlob`/`globToRegex` consumed at `git_commit_guard.mjs:223`
- **Evidence**:
  ```js
  const m = ciText.match(/push:\s*[\s\S]*?branches:\s*\[([^\]]*)\]/);
  ```
- **Impact**: `release_branches` globs and the `push:` regex compile to patterns of the form `.*`/`[^/]*`/`[^\]]*` — all linear, no nested or ambiguous quantifiers, so no catastrophic backtracking. Inputs are *trusted* (`project.json` is the maintainer's own config; `ciText` is the project's own CI file, parsed only at `/init-project`, off the hot guard path). Branch names from `git rev-parse` are bounded.
- **Recommendation**: No change. If `detectWorkflowModel` is ever fed third-party text, cap `ciText` length before matching.

### [LOW] Prototype-pollution / type-confusion on config reads (defended)
- **OWASP**: A08 Software & Data Integrity | **CWE**: CWE-1321 (assessed)
- **File**: `.claude/hooks/lib/common.mjs:800-803` (`resolveWorkflowModel`)
- **Evidence**:
  ```js
  const WORKFLOW_MODELS = new Set(['direct-to-main', 'github-flow', 'ask']);
  export function resolveWorkflowModel(value) { return WORKFLOW_MODELS.has(value) ? value : 'ask'; }
  ```
- **Impact**: Any non-allowlisted value (non-string, object, `__proto__`, etc.) resolves to `ask` (the safe no-enforcement default) via `Set.has` — no object-property access, no pollution vector. `projectGet`'s `dottedLookup` only *reads* (`part in cur`), never assigns from JSON keys. Safe.
- **Recommendation**: None. Allowlist-by-Set is the correct pattern.

## Checked and clear (no finding)

- **Fail mode (A04/A05)** — `isPrimaryWorkTree` returns `true` (→ *enforce*) on any git failure or non-repo cwd (`common.mjs:816`). Fail-secure: a broken/absent git enforces topology rather than skipping it. An attacker cannot force a false "linked" verdict without an actual linked worktree (git-dir ≠ common-dir is a real filesystem fact); `cwd`/`CLAUDE_PROJECT_DIR` is runtime-set, not attacker-tainted in the model.
- **Composition with consent (A01)** — a topology PASS does **not** `emitAllow`; it logs and falls through to the unchanged `patternViolation` / protected-branch / consent path (`git_commit_guard.mjs:226-231` → existing `validateConsentToken`). Regression-guarded by test `…protected_main_without_consent_then_still_blocked_by_consent` (AC-009). Topology cannot mask the consent gate.
- **Command injection (A03)** — `execFileSync('git', [fixed args], {cwd})` uses no shell and never interpolates user data into a command string (`common.mjs:812-813`). No injection.
- **Ordering (A04)** — topology runs *after* the detached-HEAD deny, so a detached HEAD never reaches topology (test AC-010). Hard-block `FORBIDDEN_RE` is unchanged and still precedes everything.

## Dependencies

None added. The new code uses only Node built-ins (`node:child_process` `execFileSync`, `node:fs`) and the system `git` CLI. No npm packages introduced — no CVE surface.

## Out of scope / Noted

- `detectWorkflowModel` is invoked only at `/init-project` (human-confirmed, cold path) — not in the per-commit hot path. Even a misclassification floors to `ask` (no enforcement) and is confirmed via `AskUserQuestion`, so a detection error cannot silently impose or skip enforcement.
- The hook count stays 22 (logic lives in two existing files) — no new privileged executable added to the PreToolUse chain.

