# Security reports — erp-portables-slice-b

## erp-portables-slice-b-2026-07-03.md

# Security Review — main (erp-portables-slice-b, pre-commit tree) — 2026-07-03

## Summary

Slice B adds one read-only PreToolUse hook (`branch_guard.mjs`), one git-reading Foundation primitive (`currentBranch()`), wiring, and prose/count reconciliation. No new dependencies, no network, no secrets, no privileged operations. Overall risk: **LOW**.

## Findings

### [LOW] Dangling-symlink `workflow.json` misclassifies an edit as a creation
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-59
- **File**: .claude/hooks/branch_guard.mjs:67
- **Evidence**:
  ```js
  const inScopeCreation =
    rel === WORKFLOW_REL && !existsSync(join(CLAUDE_PROJECT_ROOT, WORKFLOW_REL));
  ```
- **Impact**: If `.claude/state/workflow.json` is a dangling symlink, `existsSync` returns false and a write is treated as a creation; on a `github-flow` release branch the write is denied when an edit would have been allowed. Deny-side-only inconvenience — no bypass, no data exposure; a real bypass (crafted path that dodges `canonicalRel`) degrades to fail-open ALLOW, which is today's behavior, and `git_commit_guard`'s topology leg backstops at commit time.
- **Recommendation**: Accept. The fail-open architecture makes the worst case equivalent to the hook not existing; the symlink corner is not reachable by the model under the state-write discipline (Write tool only for Tier-2 state).

### [LOW] Branch names flow into hook log lines unescaped
- **OWASP**: A09 - Logging & Monitoring Failures | **CWE**: CWE-117
- **File**: .claude/hooks/branch_guard.mjs:82, 85
- **Evidence**:
  ```js
  logLine(HOOK, `ALLOW ${rel} branch=${branch}`);
  ```
- **Impact**: A locally crafted branch name containing newlines could forge log lines in `.claude/state/logs/branch_guard.log`. Requires local repo control (already full control); log is advisory, non-parsed.
- **Recommendation**: Accept. `logLine` is the shared primitive used by every guard; hardening belongs to `lib/common.mjs` holistically, not this hook.

## What was checked

- **Injection (A03)**: `currentBranch()` and `isPrimaryWorkTree()` use `execFileSync('git', [args])` — argv-array form, no shell interpolation; no payload data reaches subprocess arguments.
- **Access control (A01)**: hook is deny-only on one exact-match path (`canonicalRel(filePath) === '.claude/state/workflow.json'`); it cannot broaden into blocking general edits (scope conjunct first, fail-open catch wraps `main()`).
- **Availability / brick risk**: every ambiguity allows; `main().catch(() => emitAllow())` guarantees editing is never bricked by a hook crash.
- **Secrets hygiene**: diff contains no tokens, keys, or `.env` paths; `gitignore_leak_guard` unaffected.
- **Config integrity (A05/A08)**: settings wiring adds the hook after `track_guard` in both live and template settings; `expected-baseline.mjs` roster keeps audit drift-detection binding; `obj/template` manifest re-hashed by the build (audit PASS).
- **Payload parsing**: `readPayload`/`payloadGet` shared primitives; malformed payload → no `file_path` → allow (fail-open, consistent with the guard class).

## Dependencies

None added. `package.json` dependency set unchanged (project enforces empty runtime `dependencies`); `npm audit` not applicable.

## Out of scope / Noted

- `git_commit_guard.mjs` retains a private `currentBranch()` copy (line 74) — duplication flagged at simplify; slice C converges it on `lib/common.mjs`. No security impact (identical argv-array invocation).
- Pre-existing dirty files in the working tree (`.claude/memory/backlog.md`, two archived `workflow.json`s, `docs/archive/2026-06-22/mvp-sprint-parallel-cycles/`) predate this slice and are excluded from its commit surface.

