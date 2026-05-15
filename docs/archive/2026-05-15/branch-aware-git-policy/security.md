# Security Review — branch-aware-git-policy (2026-05-15)

OWASP-aligned review of the JS-piloted hooks (`git_commit_guard.mjs`, `consent_gate_grant.mjs`) plus the new state-file gate and branch-aware policy. Scope: structural change to consent enforcement and the marker-unforgeability guarantee that backs Article IV/VII.

## Summary

| Severity | Count | Highlights |
|---|---:|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 2 | (M-1) regex DoS exposure via user-set `git.branch_pattern`; (M-2) unbounded note field in marker tail |
| Low | 3 | (L-1) git subprocess error path swallows context; (L-2) module-load CWD assumption; (L-3) marker temp-file naming collision |

No Critical or High findings. The structural guarantees (marker unforgeability via UserPromptSubmit boundary; Claude-blocked self-write of state files) carry over from the bash version intact.

## Findings

### M-1 — `git.branch_pattern` regex is operator-supplied; potential ReDoS on adversarial input (CWE-1333)

**Where**: `.claude/hooks/git_commit_guard.mjs:branchPolicy()` constructs `new RegExp(pattern).test(branch)` where `pattern` comes from `project.json → git.branch_pattern`.

**Risk**: A malicious or careless `branch_pattern` value (e.g., `(a+)+$`) plus a long adversarial branch name could cause catastrophic backtracking. The pattern is set by the operator, so attack surface is small — but a copy-pasted bad regex from the internet could DoS the guard.

**Mitigation present**: Already wraps `new RegExp(pattern).test(branch)` in try/catch — invalid regex falls through to `null` (no pattern check) with a WARN log line. Catastrophic backtracking is NOT a thrown exception, so try/catch alone does not catch it.

**Recommendation**: Add a timeout-based guard (e.g., spawn the regex test in a separate worker thread with a 100ms kill-switch) OR validate the pattern against a "safe regex" allowlist before compilation. For the baseline use case (branch-name validation, typically `^(feat|fix|chore|docs)/...`), the patterns are simple — a length cap of ~256 chars + complexity heuristic would suffice. **Filed as follow-up; not blocking this PR** — the operator is the only attacker, and the guard runs synchronously per Bash invocation (not in a hot loop).

### M-2 — Marker `note` field is unbounded and could DoS log/state writes (CWE-400)

**Where**: `consent_gate_grant.mjs:handleGrantCommit/handleGrantPush` accept an optional `note` from the prompt: `/grant-commit <anything-typed-after>`.

**Risk**: A user typing `/grant-commit <100KB of text>` writes 100KB into `.claude/state/.commit_consent_grant`. Subsequent log writes echo the note. Bounded only by the user's prompt budget.

**Mitigation present**: None — the regex `^/grant-commit(\s.*)?$` accepts everything after the command.

**Recommendation**: Truncate `note` to ~256 chars before writing the marker. **Not blocking** — the user is the source of the note; abuse requires the user to abuse themselves.

### L-1 — `currentBranch()` swallows all git failures into `null`

**Where**: `git_commit_guard.mjs:currentBranch()` catches every git error and returns `null`. The branchPolicy treats `null` as "not a git repo" and emits allow.

**Risk**: If `git rev-parse --abbrev-ref HEAD` fails for a reason OTHER than "no git repo" (e.g., corrupted refs, permission issue, mid-rebase conflict), the guard silently allows the operation. An attacker who induces a transient git failure (race condition?) could bypass the policy.

**Mitigation**: Already minimal exposure — the `isInsideWorkTree()` separate check provides defense in depth. Logging is silent on the swallow.

**Recommendation**: Log the underlying error to `git_commit_guard.log` before returning null. Doesn't change behavior; aids forensics. **Filed as follow-up.**

### L-2 — `CLAUDE_PROJECT_ROOT` falls back to `process.cwd()` if env unset

**Where**: `lib/common.mjs:7` — `process.env.CLAUDE_PROJECT_DIR || process.cwd()`.

**Risk**: If a future caller invokes the hook from an unexpected cwd without the env var (e.g., a CI bot, a debugger), the hook reads `<cwd>/.claude/project.json` instead of the intended project's. Could leak state across projects on shared infrastructure.

**Mitigation**: Claude Code always sets `CLAUDE_PROJECT_DIR` when invoking hooks. The fallback is for test harnesses and ad-hoc CLI runs.

**Recommendation**: Stay as-is; the fallback is intentional for testing. **No action.**

### L-3 — Marker temp-file uses `process.pid` for uniqueness; not collision-resistant under concurrent writes

**Where**: `lib/common.mjs:writeMarkerAtomic` constructs `${markerPath}.tmp.${process.pid}` then `renameSync`.

**Risk**: Two concurrent hook invocations with the same PID (impossible on a single host, possible across containers with shared FS) could collide on the temp file.

**Mitigation**: The atomic rename ensures the final state is one of the two writes; no partial-state risk. The only risk is one writer overwriting the other's temp before its own rename.

**Recommendation**: Append `Date.now()` to the temp suffix for additional entropy. **Not blocking.**

## Carry-overs from the bash version (unchanged, still hold)

- **Marker unforgeability via UserPromptSubmit boundary**: `consent_gate_grant.mjs` only fires from Claude Code's UserPromptSubmit hook event. Claude's tool boundary cannot reach this code path. The Write-leg of `git_commit_guard.mjs` blocks Claude from writing the marker files directly via `blockMarkerSelfWrite`. The marker single-use deletion (`unlinkSync` in `validateConsentMarker`) is preserved.

- **Path normalization**: `canonicalRel` is lexical (no symlink resolution) — same as bash. Symlink-swap defense is a documented follow-up that applies to both versions.

- **TTL enforcement**: Consent token freshness check uses `Math.floor(Date.now() / 1000)` vs the marker's epoch. The TTL is read from `project.json → consent.{commit,push}_ttl_seconds` with safe defaults.

## OWASP top-10 mapping

| Category | Findings |
|---|---|
| A01 Broken Access Control | None — gate model is unchanged; marker unforgeability preserved. |
| A03 Injection | M-1 (operator-controlled regex). |
| A04 Insecure Design | None — Article VII branch-aware policy is well-grounded; defaults preserve strict behavior. |
| A05 Security Misconfiguration | None — defaults (`protected_branches: null`, `branch_pattern: null`) are fail-safe. |
| A06 Vulnerable Components | None — zero new runtime deps (hand-rolled glob matcher, Node stdlib). |
| A09 Logging Failures | L-1 (currentBranch silent swallow). |

## Verdict

**Ship.** Two Medium findings (M-1, M-2) are operator-self-DoS exposures, not external attack vectors. Three Low findings are forensics + testing improvements. No structural integrity issues with the consent-marker contract.

Follow-up tickets recommended:
- M-1 regex timeout/complexity validation
- M-2 note truncation at 256 chars
- L-1 currentBranch error logging
