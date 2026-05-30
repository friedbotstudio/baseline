# Security reports — infra-hardening

## infra-hardening-2026-05-31.md

# Security Review — infra-hardening — 2026-05-31

## Summary

Risk **as found**: **HIGH** (one HIGH, one MEDIUM, two LOW). **Residual after in-workflow fix: LOW** — see [Resolution](#resolution-2026-05-31-in-this-workflow): the HIGH and the actionable MEDIUM were fixed test-first in this same workflow; only deny-leaning / out-of-regex-reach items are deferred. The HIGH was a **consent-gate bypass regression** introduced by this very workflow: replacing `git_commit_guard`'s naive `/\bgit\s+commit\b/` substring match with a segment-aware tokenizer (the Q-003 fix) closed the false-positive on read-only commands, but opened a false-negative — a `git commit` / `git push` wrapped in `sh -c`, `eval`, command substitution, a subshell, or a brace group is no longer classified, so gate C (commit consent) and the `--amend`/`--no-verify` hard-blocks are not enforced for those forms. The token/marker handshake (consent_gate_grant + the Write-matcher) is intact; only the Bash-matcher leg is weakened.

Scope reviewed: the branch diff for `.claude/hooks/lib/common.mjs` (segment helpers), `.claude/hooks/git_commit_guard.mjs` (handleBash rewrite), `.claude/hooks/destructive_cmd_guard.mjs` (consent-write block), `.claude/hooks/memory_session_start.mjs` (grant-marker sweep). No new dependencies. Findings below were confirmed empirically against the live hooks (the wrapper bypass) or by code analysis (the write-block gaps — the guard blocks Bash commands that even *mention* these patterns, including my test harness, so the negative cases were analyzed rather than executed).

## Findings

### [HIGH] git_commit_guard: shell-wrapper forms bypass commit/push consent and FORBIDDEN hard-blocks
- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-693 (Protection Mechanism Failure), CWE-78 (OS Command shell metacharacters)
- **File**: `.claude/hooks/git_commit_guard.mjs:147-166`; `.claude/hooks/lib/common.mjs:288-342` (`splitShellSegments` / `segmentCommandTokens` / `gitSegments` / `gitSubcommandInvoked`)
- **Evidence** (empirically confirmed — all four ALLOW with no consent token on a protected branch):
  ```
  [sh -c "git commit -m x"]      => allow(no-deny)
  [eval "git commit -m x"]       => allow(no-deny)
  [(git commit -m x)]            => allow(no-deny)
  [echo $(git commit -m x)]      => allow(no-deny)
  ```
  The classifier reads the *leading* verb of each separator-split segment. For `sh -c "…"`, `eval "…"`, `(…)`, `{ …; }`, `$(…)`, and backticks, the leading verb is `sh`/`eval`/`(git`/`{`/`echo` — never `git` — so `gitSubcommandInvoked` returns false and `gitSegments` is empty (FORBIDDEN_RE is now scoped to git segments, so it is never evaluated). A `\`-newline line-continuation (`git \<newline>commit`) splits on the newline and also evades.
- **Impact**: A `git commit` / `git push` issued through any wrapper proceeds on a protected branch with **no** `commit_consent` / `push_consent` check — a complete bypass of gate C for those forms. The same path smuggles the unconditional hard-blocks `--amend`, `--no-verify`, `--no-gpg-sign`, `git config`, `git rebase -i`, `git add -A|.` (e.g. `sh -c "git commit --amend --no-verify"`). This is a **regression**: the prior substring regex matched `git commit` even inside `sh -c "…"`. Realistic trigger is prompt injection ("run `sh -c 'git commit -am wip'`"). Partial compensating control: `destructive_cmd_guard` ASKs (substring, wrapper-agnostic) on `git reset --hard` / `git clean -f` / `git push --force` — but has **no** pattern for commit consent, `--amend`, `--no-verify`, `--no-gpg-sign`, `git config`, or `rebase -i`.
- **Recommendation**: Keep the tokenizer for the leading-verb case (it is what kills the Q-003 false-positive), and add a **bounded recursion / wrapper-aware** second pass that does NOT reintroduce the grep false-positive: when a segment's leading verb is a known executor (`sh`, `bash`, `zsh`, `dash`, `env … <shell>`, `eval`, `command`, `xargs`, `nice`, `time`, `setsid`), re-run the classifier over the executed string argument; and when a segment contains command-substitution (`$(…)` / backticks) or is a subshell/brace-group, classify the inner command. The discriminator vs. `grep "git commit"` is that grep's quoted string is data, whereas an executor's quoted string is *executed* — so only recurse for executor verbs / substitution / grouping, never for arbitrary quoted arguments. Re-scope FORBIDDEN_RE to also fire on the recursively-extracted inner command.

### [MEDIUM] destructive_cmd_guard: consent-write block misses non-JS writers, `>|` clobber, and `$VAR`-indirected paths
- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-693 (Protection Mechanism Failure)
- **File**: `.claude/hooks/destructive_cmd_guard.mjs:38-78` (`CONSENT_PATH_RE`, `WRITE_VERB_RE`, `PROG_WRITE_RE`, `CONSENT_REDIRECT_RE`, `writesConsentPath`)
- **Evidence** (by analysis of the matchers):
  ```
  python3 -c "open('.claude/state/commit_consent','w').write('1')"   -> ALLOW (PROG_WRITE_RE is JS-only)
  perl -e 'open(F,">",".claude/state/push_consent")'                 -> ALLOW (non-JS writer)
  echo 1 >| .claude/state/commit_consent                            -> ALLOW (CONSENT_REDIRECT_RE rejects the `|` in `>|`)
  D=.claude/state; echo 1 > $D/commit_consent                       -> ALLOW (CONSENT_PATH_RE needs the literal `.claude/state/` prefix)
  ```
  `PROG_WRITE_RE` only knows the Node `writeFileSync`/`appendFileSync`/`createWriteStream`/`writeFile` symbols; `python`/`perl`/`ruby`/`awk` file writes are invisible. `CONSENT_REDIRECT_RE` does not accept the `>|` clobber operator. A path assembled from a shell variable defeats the literal-prefix `CONSENT_PATH_RE`.
- **Impact**: A Bash command can still write a consent token/marker through these forms, defeating the Bash-leg this workflow added. Severity is bounded because the **primary** structural control is unchanged: the Write-matcher approval guards (`spec_approval_guard`, `swarm_approval_guard`, `git_commit_guard`) still gate Write/Edit/MultiEdit token writes on a fresh marker; this Bash leg is best-effort defense-in-depth.
- **Recommendation**: Add common non-JS write signatures to the prog-write set (`open(…, ['"]?[wa]`, `>` inside `perl -e`/`ruby -e`, `awk … > file`), accept `>|` in the redirect pattern, and document the `$VAR`-indirection limitation explicitly (a full fix needs variable resolution, which is out of scope for a regex guard). Mark the block as best-effort in the hook header so future readers do not over-trust it.

### [LOW] destructive_cmd_guard: symmetric false-positive — any command mentioning a consent path + a write token is denied
- **OWASP**: A04 - Insecure Design (availability/usability of the control) | **CWE**: CWE-693
- **File**: `.claude/hooks/destructive_cmd_guard.mjs:62-78`
- **Evidence**: This review's own probe harness was blocked because its command text contained `cp … .claude/state/.spec_approval_grant` as a *quoted argument*. `writesConsentPath` matches `CONSENT_PATH_RE` + `WRITE_VERB_RE`/`PROG_WRITE_RE` anywhere in the whole command, with no segment-awareness — the same class of flaw Q-003 fixed for `git_commit_guard`, here in the opposite (deny-leaning) direction.
- **Impact**: Legitimate read-only commands that merely reference these paths (a `grep` for `writeFileSync.*commit_consent`, a test harness, a doc-generating script) are denied. Deny-leaning, so not a security hole — a usability/availability cost.
- **Recommendation**: Reuse the new `gitSegments`/segment-aware tokenizer pattern: only treat a consent path as written when the *write verb and the path are in the same executed segment*, not when either appears anywhere in the line. Lower priority than the HIGH (this errs safe).

### [LOW] memory_session_start: grant-marker sweep follows symlinks / minor TOCTOU
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-59 (Link Following), CWE-367 (TOCTOU)
- **File**: `.claude/hooks/memory_session_start.mjs:42-66`
- **Evidence**: The sweep does `existsSync` → `readFileSync(grant,'utf8')` → `rmSync(grant)` on fixed paths under `.claude/state/`. `readFileSync` follows a symlink (reads the first line of the link target to parse an epoch); `rmSync` removes the link, not the target.
- **Impact**: Negligible — the paths are fixed own-state files, the read value is only parsed as an integer age (never logged/exfiltrated), and an attacker able to plant a symlink under `.claude/state/` already has local write access. No privilege gain.
- **Recommendation**: Optionally `lstatSync` + skip non-regular files before reading, mirroring the symlink-defense item already noted in seed.md §16 follow-ups. Acceptable to defer.

## Dependencies

No new packages in this diff. `npm run build` regenerated the manifest (Article XI); no dependency changes.

## Resolution (2026-05-31, in this workflow)

Per the user's decision ("fix now"), the following were closed in-place with failing-test-first coverage:

- **HIGH (wrapper bypass) — FIXED.** `gitSubcommandInvoked`/`gitSegments` now classify over `executedFragments(cmd)`: a quote-aware extractor that peels subshells/brace-groups, recurses into executor verbs (`sh -c`/`bash -c`/`zsh`/`dash`/`eval` and prefix executors `command`/`env`/`sudo`/`xargs`/`timeout`/…), follows command substitution `$( … )` + backticks **only when shell-active (not single-quoted)**, and normalizes `\`-newline. `sh -c "git commit"`, `eval`, `(…)`, `{ …; }`, `echo $(git commit)` now classify and enforce consent / FORBIDDEN_RE; `grep "git commit"`, `echo "git commit"`, and a single-quoted `'$(git commit)'` stay unclassified (Q-003 preserved). Covered by `tests/git-commit-guard-tokenize.test.mjs` (unit + guard-payload deny tests).
- **MEDIUM (consent-write block: non-JS writers + `>|`) — FIXED.** `PROG_WRITE_RE` now also matches `open(…, 'w'|'a')` (python/ruby) and perl `open(…, '>'…)`; `CONSENT_REDIRECT_RE` accepts the `>|` clobber operator. Covered by `tests/destructive-consent-write-block.test.mjs`.

Deferred (tracked in backlog / seed.md §16 guard-hardening sweep — deny-leaning or out of a regex guard's reach):

- MEDIUM `$VAR`-indirected consent paths (`D=.claude/state; echo 1 > $D/commit_consent`) — needs shell variable resolution; out of scope for a regex guard. Documented as best-effort.
- LOW symmetric false-positive in `destructive_cmd_guard` (whole-command match, not segment-scoped) — deny-leaning; fold into the same segment-aware pass later.
- LOW `memory_session_start` grant-marker sweep symlink/TOCTOU — own-state, local-only.

## Out of scope / Noted

- The wrapper-bypass class (Finding HIGH) is a fundamental limit of regex/tokenizer command guards versus a real shell parser. The realistic threat model for these hooks is the *governed agent under prompt injection*, not a remote attacker; even so, a one-line `sh -c "git commit"` defeating gate C warrants closing before commit.
- seed.md §16 already tracks a broader guard-hardening follow-up (canonical_rel coverage, fail-closed on malformed payload, symlink defense across all guards). Findings MEDIUM/LOW here fold naturally into that scope.

