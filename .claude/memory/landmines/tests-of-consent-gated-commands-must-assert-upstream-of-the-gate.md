---
key: tests-of-consent-gated-commands-must-assert-upstream-of-the-gate
category: landmines
scope: [scout, spec, tdd, security, integrate]
verified-at: 97b3e6d
last-touched: 2026-07-09
---

- Path: `tests/forbidden-git-ops-spellings.test.mjs` (the `guardReason` / `blockedAsForbiddenOp` helpers) against `.claude/hooks/git_commit_guard.mjs → handleBash`, where the `FORBIDDEN_RE` hard-block (line ~274) runs BEFORE the subcommand classification and consent check (line ~279).
- Landmine: a `git commit …` command has TWO independent reasons to be denied — the Art. VII hard-block, and the branch-aware consent policy (every branch is protected while `git.protected_branches` is null). A test asserting on the guard's DECISION (`allow`/`deny`) therefore silently depends on whether a `/grant-commit` token happens to be fresh. It is green for 900s after a human grants consent and red otherwise. Worse, the failure mode inverts by assertion direction: `assert allow` passes only inside the window (fails in CI, which never has a token), while `assert deny` passes only OUTSIDE it (green in CI, red exactly when a human is trying to commit — the hardest variant to notice).
- Observed 2026-07-09, twice in the same file: four `assert allow` tests shipped in `8e75e6c` and only failed once the branch merged to main with an expired token; the replacement `assert.notEqual(guardReason(cmd), '')` test added in `97b3e6d` to PROVE the fix carried the inverted form of the same flaw. Writing the mitigation into the guard's comments did not prevent violating it in the same file.
- Mitigation: assert on something UPSTREAM of the gate. (1) For hard-block coverage, assert on the denial REASON (`/forbidden git operation/`), which is deterministic because the hard-block precedes consent. (2) For classification coverage, drop to the pure helpers (`gitSubcommandInvoked(stripQuotedHeredocBodies(cmd), 'commit')`) — no guard, no consent, no clock. (3) Add a source-level assertion that the regression cannot return (`assert.doesNotMatch(guardSrc, /gitSubcommandInvoked\(cmd,/)`). (4) Before landing, run the suite in BOTH consent states; the token is Write-tool-only, so wait it out rather than reach for Bash (`destructive_cmd_guard` blocks that, correctly).
- Generalization: any test that drives a hook whose decision depends on a TTL'd artifact is time-dependent unless it asserts on a pre-TTL signal. This applies to `spec_approval_guard` and `swarm_approval_guard` identically.
