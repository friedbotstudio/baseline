# Security reports — erp-portables-slice-c

## erp-portables-slice-c-2026-07-04.md

# Security Review — main (erp-portables-slice-c) — 2026-07-04

## Summary

Slice C makes gate C branch-conditional (requires_commit_consent condition + autonomous commit→push→PR landing). The consent trust boundary is **not weakened**: the condition removes only the workflow-level yield in a case where `git_commit_guard` already permits consent-free commit/push (non-protected branch), and every structural enforcement path (`consent_gate_grant` marker flow, guard Bash/Write legs, `FORBIDDEN_RE`) is byte-unchanged. Overall risk: **LOW**.

## Findings

### [LOW] Shell interpolation surface in the commit skill's landing commands
- **OWASP**: A03 - Injection | **CWE**: CWE-78
- **File**: .claude/skills/commit/SKILL.md:26 (Step 7 prose)
- **Evidence**:
  ```
  - `git push -u origin <branch>` (the current branch by name — never `--force`).
  - `gh pr create --base <release>` where `<release>` is the first entry of
    `git.release_branches` (default `main`)
  ```
- **Impact**: `<branch>` comes from `git rev-parse --abbrev-ref HEAD` and `<release>` from `project.json`. A hostile branch name or a compromised `project.json` could smuggle shell metacharacters into the Bash invocation the model composes. Exploitation requires local write access (create a branch / edit project.json), which already implies broader compromise — same accepted-risk class as the sweep.mjs argv finding (docs/archive/2026-05-13/memory-lifecycle-closure/security.md).
- **Recommendation**: when executing Step 7, quote both operands (`git push -u origin "<branch>"`) and treat a branch name failing `^[A-Za-z0-9._/-]+$` as a landing failure (yield). Prose-level guidance; no code change in this slice.

### [LOW] Seed-time predicate resolution can go stale before commit time
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-367 (TOCTOU)
- **File**: .claude/skills/triage/seed-tasklist.mjs:87
- **Evidence**:
  ```
  const ctx = { commitConsentRequired: !isAutonomousFeatureLanding() };
  const tasks = materializeTaskList(track, { slug, ctx });
  ```
- **Impact**: the branch/protection state can change between tasklist seeding and Phase 11 (e.g. user switches to `main` mid-workflow). The TaskList would then lack the gate task while consent is actually required.
- **Recommendation**: none needed — mitigated by design. `git_commit_guard`'s Bash leg re-evaluates the branch-aware policy at commit time and blocks a consent-requiring commit regardless of TaskList shape; the harness SOP documents this backstop explicitly. Verified `git_commit_guard.mjs` is untouched in this diff (`git diff HEAD -- .claude/hooks/git_commit_guard.mjs` is empty).

### [LOW] `redirectDeps` recursion trusts validator acyclicity
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-674
- **File**: src/cli/track-tasklist-materializer.js:52
- **Evidence**:
  ```
  function redirectDeps(deps, omitted) {
    ...
    out.push(...redirectDeps(omitted.get(dep), omitted));
  ```
- **Impact**: mutually-referencing omitted nodes would recurse unboundedly. Unreachable in practice: I5 rejects cyclic DAGs before materialization, and v1 actuates conditions on `grant-commit` nodes only (at most one omitted node per track).
- **Recommendation**: accept. Revisit only if conditions are ever actuated on multiple interdependent nodes.

## What was checked

- **A01 access control / consent gates**: condition resolution cannot be forged into a consent bypass — on protected branches `requires_commit_consent` resolves true (fail-safe chain: `computeProtectedBranch` defaults protected on null branch/globs/invalid types; `computeAutonomousFeatureLanding` defaults false on every ambiguous signal; missing ctx includes the node; unknown predicate includes the node and fails I11 validation). Covered by tests/gate-c-predicates.test.mjs + materializer fail-safe tests.
- **A03 injection**: new git shell-outs use `execFileSync` with fixed argv (no shell); the only interpolation surface is SKILL prose (finding 1).
- **Secrets hygiene**: diff adds no tokens, keys, or env access.
- **AuthN/AuthZ**: consent marker flow (`consent_gate_grant` → approval guards) untouched; `git_commit_guard`, `spec_approval_guard`, `swarm_approval_guard` byte-unchanged.
- **Cryptography**: none touched.
- **Input validation**: unknown `condition.predicate` fails closed at validation (invariant_i11 named error, tested); malformed ctx fails safe toward consent.

## Dependencies

None added or updated (node stdlib only).

## Out of scope / Noted

- The pre-existing residual `cd`-into-epic-dir bypass (backlog) and `FORBIDDEN_RE` raw-regex trade-off are unchanged by this slice.
- `gh` CLI is exercised via exit codes only; its authentication state is the user's, never stored by the baseline.

