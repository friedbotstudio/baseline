---
key: consent-guard-carveout-must-retain-executed-substitutions
category: landmines
scope: [security, tdd]
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- Path: `.claude/hooks/lib/common.mjs` → `writesConsentPath` / `sanitizeGitCommitForScan` / `collectExecutedSubstitutions`.
- Trap: `destructive_cmd_guard` now exempts a `git commit` MESSAGE payload (`-m`/`--message` arg + heredoc body) from consent-path scanning so a commit message that merely *describes* consent tokens isn't blocked (fixed the `git commit -F <file>` workaround papercut). The naive carve-out — strip the whole message arg/heredoc body before scanning — opened a HIGH guard BYPASS: a real consent write hidden in a command substitution inside the message (`git commit -m "$(tee .claude/state/commit_consent)"`, backtick form, `--message="$(... > .../push_consent)"`, or `$()` in an unquoted heredoc body) was stripped along with the prose and thus ALLOWED. The pre-carve-out whole-command scan had correctly blocked all of these. Caught by the `/security` phase, not by tests-first.
- Mitigation: when sanitizing, RETAIN every EXECUTED command-substitution/backtick body (use `extractSubstitutions` recursively via `collectExecutedSubstitutions`) and re-append it to the scanned string — drop only literal, non-executed prose. Also: an unterminated heredoc must NOT swallow trailing lines (it would hide a trailing real write). General rule: any "exempt part of a command from a security scan" carve-out SHALL still scan whatever that part would EXECUTE. Over-inclusion (scan a literal that looks executable) is the safe direction; under-inclusion is a bypass. Regression tests: `tests/guard-commit-msg-falsepos.test.mjs` (5 SEC cases: 4 substitution forms BLOCK + plain prose ALLOW + unterminated-heredoc BLOCK).
