# Security reports — guard-commit-msg-falsepos

## guard-commit-msg-falsepos-2026-06-03.md

# Security Review — guard-commit-msg-falsepos — 2026-06-03

## Summary

**Overall risk: HIGH at review → LOW after the in-workflow fix (see Resolution).** The `writesConsentPath` carve-out (`sanitizeGitCommitForScan`) introduces a **guard bypass**: a real consent-path write embedded in a command substitution (`$(...)`) or backtick span inside a `git commit` message payload (`-m`/`--message` arg, or a heredoc body) is stripped along with the message prose, so `destructive_cmd_guard` no longer sees it and **allows** the write. The pre-fix code (whole-command scan) blocked these. This is a regression in the exact security property the guard exists to enforce. One MEDIUM (heredoc-without-close swallow) and the segment-isolation checks are clean.

## Findings

### [HIGH] Consent write hidden in a commit-message command substitution bypasses the guard

- **OWASP**: A04 - Insecure Design (security-control bypass) · **CWE**: CWE-78 (OS Command Injection control bypass) / CWE-693 (Protection Mechanism Failure)
- **File**: `.claude/hooks/lib/common.mjs` — `stripCommitMessageArgs` (drops `-m`/`--message` arg wholesale) + `stripGitCommitHeredocBodies` (drops heredoc body wholesale)
- **Evidence** (empirically verified via a probe importing `writesConsentPath`):
  ```
  ALLOW | git commit -m "$(tee .claude/state/commit_consent)"
  ALLOW | git commit -m "`date +%s > .claude/state/commit_consent`"
  ALLOW | git commit --message="$(echo 1 > .claude/state/push_consent)"
  ALLOW | git commit -F - <<EOF\n$(tee .claude/state/commit_consent)\nEOF
  BLOCK | git commit -m x; tee .claude/state/commit_consent   (control — correctly blocked)
  ```
  The first four perform a real write to a consent path; all are now ALLOWED. Pre-fix, the whole-command scan matched `commit_consent` + the `tee`/redirect write-signal and BLOCKED them.
- **Impact**: Claude could forge a consent token (`commit_consent` / `push_consent`) or an approval file via a single `git commit` whose message embeds `$(... > .claude/state/<token>)`. That defeats the consent gate the guard backs — the whole point of `writesConsentPath`.
- **Recommendation**: The message payload that gets removed SHALL still be scanned for *executed* sub-commands. The module already has the machinery: `extractSubstitutions(s)` returns the bodies of `$( … )` / backtick spans that the shell actually executes (quote-aware). Fix: in the sanitizer, before discarding a message arg or heredoc body, extract its command-substitution/backtick bodies and **retain them** in the string handed to the `CONSENT_*` tests (drop only the literal, non-executed prose). Add tests asserting the four cases above BLOCK while the plain-prose cases (current AC-001..003) still ALLOW.

### [MEDIUM] Heredoc with no closing delimiter swallows trailing lines

- **OWASP**: A04 - Insecure Design · **CWE**: CWE-693
- **File**: `.claude/hooks/lib/common.mjs` — `stripGitCommitHeredocBodies` (the `while (j < lines.length && !closeRe.test(...))` scan)
- **Evidence**: if a git-commit heredoc opener has no matching closing TAG line, the scan consumes every remaining line as "body", so a trailing `tee .claude/state/commit_consent` on a later line would be dropped and not scanned.
- **Impact**: Low practical exploitability — bash itself will not execute a heredoc that is never closed (the command blocks waiting for the delimiter), so a never-closed heredoc would not run the trailing write either. Still, the guard should not rely on that coincidence.
- **Recommendation**: When no closing TAG is found, treat the heredoc as unterminated and do **not** swallow trailing lines — strip only the opener token and leave subsequent lines in place to be scanned. Add a regression test.

## Checks performed (clean)

- **(a) Segment isolation** — `sanitizeGitCommitForScan` only strips message args from segments where `gitSubcommandInvoked(seg,'commit')` is true; a non-commit segment (`tee .../commit_consent` after `;`/`&&`) is preserved verbatim and still blocked (control case passes). No non-commit write is ever stripped. CLEAN.
- **(c) Message-arg strip, literal prose** — plain-prose messages (AC-001..003) correctly allowed; no over-reach for literal text.
- **(d) Quote/separator** — `;`/`&&` inside a quoted message do not split (quote-aware `splitShellSegments`); segments rejoined with `\n` (an unquoted separator) stay isolated. CLEAN.

## Dependencies

No new packages. Change uses only in-module helpers and Node built-ins. No CVE surface.

## Resolution (post-fix, same workflow)

Both findings were fixed by looping back through `/tdd` before this phase completed:

- **HIGH (substitution bypass)** — `sanitizeGitCommitForScan` now re-appends every EXECUTED command-substitution/backtick body (via the new recursive `collectExecutedSubstitutions`, built on `extractSubstitutions`) from the original command before the `CONSENT_*` scan. A write hidden in a message substitution is retained and blocked; plain prose adds nothing and stays allowed.
- **MEDIUM (unterminated heredoc)** — `stripGitCommitHeredocBodies` no longer swallows trailing lines when no closing TAG is found; it strips only the opener token and leaves the rest to be scanned.

Verification (5 new SEC tests added, all green):
```
BLOCK | git commit -m "$(tee .../commit_consent)"
BLOCK | git commit -m "`date +%s > .../commit_consent`"
BLOCK | git commit --message="$(echo 1 > .../push_consent)"
BLOCK | git commit -F - <<EOF\n$(tee .../commit_consent)\nEOF
ALLOW | git commit -m "fix: mentions commit_consent and the word tee"   (plain prose)
BLOCK | git commit -m x; tee .../commit_consent                          (control)
```
Suite after fix: 39/39 (13 new incl. 5 security + 26 guard regression), audit PASS. **Residual risk: LOW.**

## Out of scope / Noted

- `drift_check.mjs` diffs `mergeBase..HEAD` (committed history), so it is a no-op during the pre-commit `/tdd` phase — surfaced separately during this workflow; candidate for a backlog item, not part of this diff.
- `destructive_cmd_guard` scans the entire Bash command string including a `git commit` message body — the very false-positive this workflow fixes. Worth noting the guard also blocks benign probe/test commands that quote consent basenames (observed this session); the carve-out here addresses the `git commit` case only, per the spec's Non-goals.

