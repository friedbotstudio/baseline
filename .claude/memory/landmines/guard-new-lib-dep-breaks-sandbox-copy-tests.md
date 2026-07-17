---
key: guard-new-lib-dep-breaks-sandbox-copy-tests
category: landmines
scope: [scout, spec, tdd, security, integrate]
---

- Path: `.claude/hooks/git_commit_guard.mjs` (any hook that gains a new `./lib/<x>.mjs` import); fixtures `tests/branch-aware-git-policy.test.mjs` + `tests/git-topology-guard.test.mjs` (the `buildSandbox`/`addWorktree` `cpSync` helpers).
- Trap: those tests build a temp `CLAUDE_PROJECT_DIR` by `cpSync`-ing a CURATED list of hook files (`common.mjs` + the guard + grant), NOT the whole hooks dir. When the guard gains a new lib dependency (here `lib/closure-check.mjs`), the sandbox lacks it, the guard's `import` throws at load, and `main().catch → emitAllow` makes the guard **FAIL-OPEN**: every deny-expecting test reads "allow" (branch policy, consent, detached HEAD, FORBIDDEN_RE, topology all break at once). The signature — "expected deny; got allow" across unrelated guard behaviors — reads like a logic regression but is a missing-fixture-file. The guard's own new tests pass (they run GUARD from the real repo path, which has the lib), masking the gap.
- Mitigation: when a sandbox-copied hook gains a new `lib/` import, add a matching `cpSync(<NEWLIB>, join(root, '.claude/hooks/lib/<x>.mjs'))` to EVERY `buildSandbox`/`addWorktree` helper that copies that hook (two spots in `git-topology-guard`). General rule: a curated-file-copy fixture must be updated in lockstep with any new runtime dependency of the copied file (same family as `hooks-edit-cascade` and the §18 fixture-seed landmine). The fail-open is the dangerous part — a guard that crashes at import bypasses consent too. Caught live in `commit-closure-stamp-carry`.
- Verified-at: b667aa8
- Last-touched: 2026-06-21
