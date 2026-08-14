---
key: hook-sandbox-fixtures-use-an-explicit-cpsync-allowlist
category: landmines
scope: [tdd, security, integrate]
verified-at: c92f82a
last-touched: 2026-08-14
---

- Path: `tests/branch-aware-git-policy.test.mjs:21`, `tests/git-topology-guard.test.mjs:31`
- Trap: these suites build a temp `CLAUDE_PROJECT_DIR` by `cpSync`-ing an EXPLICIT ALLOWLIST of `.claude/hooks/lib/*` files, not by copying the directory. Add any new import to a hook lib and the spawned hook dies `ERR_MODULE_NOT_FOUND` — and because the harness reads the resulting EMPTY STDOUT as **allow**, every deny assertion in the file passes in the wrong direction. Observed live: adding `slug.mjs` to `consent-decision.mjs` flipped 21 assertions across the two files from deny to vacuously-green.
- Mitigation: whenever a hook or a `hooks/lib` module gains a dependency, add it to BOTH allowlists in the same edit. `git-topology-guard.test.mjs` stages TWICE (the sandbox at `:49-54` and the linked worktree at `:86-91`) — patching only the first leaves half the suite broken. Confirmed live again on 2026-08-14: `common.mjs` gained an import of `glob-match.mjs`, and the worktree leg was the site nearly missed.
- The deeper property, not yet fixed: `git_commit_guard` **fails OPEN on crash**. A guard that cannot run produces no stdout, and no stdout means the tool call proceeds. That is the opposite of what a consent gate should do on failure. Flagged under "Out of scope" in `docs/archive/2026-07-25/slug-guard-hoist-and-consent-expiry/security.md`; a fail-closed wrapper or supervisor default-deny needs its own spec.
- Related: [[.claude/hooks/lib/slug.mjs]], [[commit-consent-token-is-never-consumed-after-use]].
