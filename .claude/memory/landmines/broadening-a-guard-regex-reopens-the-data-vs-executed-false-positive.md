---
key: broadening-a-guard-regex-reopens-the-data-vs-executed-false-positive
category: landmines
scope: [scout, spec, tdd, security, integrate]
verified-at: 97b3e6d
last-touched: 2026-07-09
---

- Path: `.claude/hooks/git_commit_guard.mjs` → `FORBIDDEN_RE` + the `gitSegments(sanitizeGitCommitForScan(stripQuotedHeredocBodies(cmd)))` call in `handleBash`; helpers in `.claude/hooks/lib/common.mjs` → `stripQuotedHeredocBodies` / `sanitizeGitCommitForScan` / `collectExecutedSubstitutions`.
- Landmine: a hard-block regex naming a NARROW literal (`git checkout --`) rarely appears in prose, so scanning the raw command string looks safe. Broaden it to cover an OPERATION in every spelling (`git restore`, `git clean -fd`, `git stash drop`) and it now matches the commit message that documents the change, and the memory entry describing it. Observed twice on 2026-07-09: the `forbidden-git-ops-spellings` change was denied by the rule it was adding, then the `cat >> landmines.md <<'ENTRY'` write documenting THAT was denied too. This is Q-003 (see `shell-command-guards-must-classify-wrapper-and-quote-aware`) re-opened from the other side — that entry warns about matching data as a command; widening the pattern widens the data surface.
- Second trap, one layer down: stripping the body is not enough. `sanitizeGitCommitForScan` re-appends every EXECUTED command substitution (so `git commit -m "$(git restore x)"` still blocks), and `extractSubstitutions` is blind to heredoc quoting — markdown backticks in a body were harvested as executed substitutions. Third trap: `sanitizeGitCommitForScan` only strips heredocs whose opener is a `git commit`, so a `cat`/`tee` heredoc body survived and its backticks/parens split into fake `git restore` segments.
- Security boundary (do not "simplify" this away): a quoted heredoc is DATA for a sink (`cat`, `tee`, `git commit -F -`) but a SCRIPT for an executor — `bash <<'EOF'\ngit restore x\nEOF` really runs it. `stripQuotedHeredocBodies` therefore preserves the body when the opener verb is in `SHELL_C_EXECUTORS`/`PREFIX_EXECUTORS`. An unquoted `<<TAG` always expands and is always preserved.
- Mitigation: scan the EXECUTABLE SHAPE, never the payload. When widening any guard pattern, add the paired allow/deny cases in the same commit: prose in `-m`, prose in a quoted data-sink heredoc, the op inside an executed substitution (must deny), the op after `&&` in a compound (must deny), and the op inside an executor heredoc (must deny). `tests/forbidden-git-ops-spellings.test.mjs` pins all of them.
