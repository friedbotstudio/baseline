---
key: shell-command-guards-must-classify-wrapper-and-quote-aware
category: landmines
scope: [scout, spec, tdd, security, integrate]
---

- Path: `.claude/hooks/lib/common.mjs` → `executedFragments` / `gitSubcommandInvoked` / `gitSegments` / `extractSubstitutions` / `shellTokens`; consumed by `.claude/hooks/git_commit_guard.mjs` (handleBash) and `.claude/hooks/destructive_cmd_guard.mjs`.
- Trap: a Bash-matcher guard that classifies a command by regex/substring has TWO opposite failure modes, and fixing one naively opens the other. (1) Substring match false-POSITIVES on data: `grep "git commit"` was blocked as a commit (Q-003). (2) Leading-verb-only tokenizing false-NEGATIVES on wrappers: `sh -c "git commit"`, `eval "..."`, `command git commit`, `(git commit)`, `echo $(git commit)`, and `\`-newline continuations execute git but evade a verb==git check — a security-HIGH consent-gate bypass (docs/archive/2026-05-30/infra-hardening/security.md). (3) Regex extraction of `$(...)`/backticks is itself quoting-blind: a `$(git commit)` inside SINGLE quotes is literal (not executed) and must NOT classify, else you re-open the Q-003 false-positive.
- Mitigation: classify over `executedFragments(cmd)` — peel subshell/brace groups, recurse into executor verbs (`sh -c`/`bash -c`/`eval`/`command`/`env`/`xargs`/`timeout`…), follow `$(…)`/backticks ONLY when shell-active (track single-quote state; double quotes do not suppress), normalize `\`-newline. The discriminator vs. a grep pattern: an executor's quoted string is executed; grep's is data. Scope FORBIDDEN_RE checks to the executed git fragments. Covered by `tests/git-commit-guard-tokenize.test.mjs` (24 cases incl. wrapper-deny + single-quote-not-classified).
- Verified-at: HEAD
- Last-touched: 2026-05-31
