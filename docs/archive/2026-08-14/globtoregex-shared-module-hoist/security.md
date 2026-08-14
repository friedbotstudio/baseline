# Security reports — globtoregex-shared-module-hoist

## globtoregex-shared-module-hoist-2026-08-14.md

# Security Review — main — 2026-08-14

Scope: the branch diff for `globtoregex-shared-module-hoist` — 13 modified files, 4 new files, 51 insertions / 233 deletions, plus the new `.claude/hooks/lib/glob-match.mjs`. Well under the 2,000-line stop threshold.

## Summary

Overall risk: **LOW**. The change is a net security improvement: it deletes five hand-rolled `globToRegex` copies, four of which still carried the CWE-1333 catastrophic-backtracking defect fixed once in `write-set-profile.mjs` and never propagated. The single surviving compiler collapses star runs and refuses a glob at `MAX_UNBOUNDED_SEGMENTS`, so the measured 45,952 ms worst case is now unreachable. One residual is worth recording: the `RangeError` the new bound raises reaches a fail-open `catch` in `git_commit_guard`, so a malformed operator glob degrades to an allowed commit rather than a hung hook.

## Findings

### [LOW] A refused glob in `git.protected_branches` fails open at the consent guard

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-703 (Improper Check or Handling of Exceptional Conditions)
- **File**: `.claude/hooks/git_commit_guard.mjs:121`, reaching `.claude/hooks/lib/common.mjs:481`

- **Evidence**:

  ```
  // common.mjs:478-483 — matchAnyGlob now compiles through the shared module,
  // which throws rather than returning false on a refused shape.
  for (const glob of globs) {
    if (typeof glob !== 'string' || glob === '') continue;
    if (globToRegex(glob, { charClass: true }).test(name)) return true;
  }

  // git_commit_guard.mjs:385-388 — the top-level handler allows on any throw.
  main().catch((err) => {
    logLine(HOOK, `ERROR ${err && err.message ? err.message : String(err)}`);
    emitAllow();
  });
  ```

- **Impact**: a `git.protected_branches` entry with five or more unbounded segments (`**x**x**x**x**x`) makes `branchPolicy()` throw. The guard logs the error and emits `allow`, so the commit proceeds on a protected branch without a fresh `commit_consent`. `branch_guard.mjs:92` fails open the same way. This is not a privilege-boundary crossing — the input is `.claude/project.json`, and an actor who can edit it can already set `protected_branches: []` — which is why this is LOW and not MEDIUM. It is recorded because the spec states the `RangeError` must propagate "rather than reading as no match", and at this one call site the propagation terminates in an allow.

- **Recommendation**: no change in this workflow. If it is tightened later, the fix belongs in the guard, not the compiler: catch the `RangeError` at `branchPolicy()` and resolve `isProtected = true`, matching the existing `invalid type → fail-safe to protected` branch three lines below it. Do not swallow it inside `matchAnyGlob` — that restores the silent-no-match behavior the bound exists to remove.

### [LOW] Behavior-preservation rests on a generated corpus, not on the deleted sources

- **OWASP**: A08 — Software & Data Integrity Failures | **CWE**: CWE-1174 (ASP.NET Misconfiguration: Improper Model Validation) — closest available; the concern is validation-by-snapshot
- **File**: `tests/fixtures/glob-corpus.json`, asserted at `tests/glob-match.test.mjs:109`

- **Impact**: the guarantee that no consumer's matching behavior changed is carried by 53 globs × 4 consumers of recorded pre-hoist `.source` strings. A dialect difference outside that corpus would land unnoticed. The consent-relevant dialect (`charClass`, used by `git.protected_branches`) is covered, and AC-008's live-config probe compiles all 45 globs the running `project.json` declares, so the exposure is a glob shape no consumer currently uses.

- **Recommendation**: accept. The corpus is keyed per consumer rather than shared, which is what makes a per-dialect drift visible instead of averaged away. Speculative — no drift is demonstrated.

## Checks performed and clean

| Check | Result |
|---|---|
| CWE-1333 ReDoS in the surviving compiler | bounded — `MAX_UNBOUNDED_SEGMENTS` refuses at 5; four segments measure 96 ms, six measured 45,952 ms |
| CWE-1333 in the deleted copies | five copies removed; `tests/glob-match.test.mjs:287` asserts exactly one definition survives |
| CWE-22 path traversal via glob input | none — the compiler emits an anchored `RegExp` and performs no path resolution |
| Regex injection through a glob member | escape set `.+()\|^$\\{}` applied in every dialect; `[]` escaped unless `charClass` is on |
| Unterminated `[` (SyntaxError → guard crash) | handled — `closingBracket` returns -1 and the bracket is escaped as a literal |
| Non-string / non-array inputs | `globToRegex` throws `TypeError`; `matchesAnyGlob` returns `false` on a non-array and skips non-string members |
| Consent-path behavior change (`git.protected_branches`) | `charClass: true` preserves the pre-hoist dialect; corpus block `d3` covers it |
| Write-boundary behavior change (`write-surface.mjs`) | `MAX_STAR_RUN` bound retained at the declaration boundary, now single-definition |
| Secrets in the diff | none — grep for key/token/password/PEM patterns returned nothing |
| New dependencies | none; `npm audit --omit=dev` reports 0 vulnerabilities |
| Vendored copies under `.claude/skills/impeccable/scripts/` | out of scope by spec §Non-goals; unreachable from any guard path, still carry the per-pair emit |

## Dependencies

No packages added, removed, or version-changed in this diff.

## Out of scope / Noted

- The four vendored `globToRegex` copies in `.claude/skills/impeccable/scripts/` (`live.mjs:229`, `live-inject.mjs:465`, `hook-lib.mjs:730`, `lib/impeccable-config.mjs:390`) still emit per star pair and remain exponential on a long run. They are third-party and unreachable from any guard or consent path, so they are not a live exposure here — but they are the same defect class this workflow exists to remove, and a future vendor sync should carry the fix upstream rather than re-landing the copies.
- `MAX_UNBOUNDED_SEGMENTS = 5` derives from a measurement on this machine's V8. On a slower engine the four-segment admissible worst case could exceed AC-002's 2,000 ms ceiling. That is a test-flake risk, not a security one; the spec directs lowering the bound rather than raising the ceiling.

