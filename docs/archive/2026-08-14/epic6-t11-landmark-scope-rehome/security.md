# Security reports — epic6-t11-landmark-scope-rehome

## epic6-t11-landmark-scope-rehome-2026-08-14.md

# Security Review — main — 2026-08-14

*Second pass. The first pass raised one MEDIUM; the human directed a fix, the spec was amended (AC-010, AC-011), and the fix shipped. This pass verifies the fix and records what the first pass got wrong about its blast radius.*

## Summary

Overall risk: **MEDIUM**, and the residual risk is now entirely **outside this diff**. The catastrophic-backtracking defect this change exposed is fixed and measured: 133,913 ms → **0.45 ms**. The first pass understated the problem by scoping it to one module. `globToRegex` is duplicated across at least nine modules by the hook-lib self-containment convention; four more live copies provably share the identical defect, and one of them is confirmed reachable and hanging. That is pre-existing, untouched by this diff, and needs its own spec.

## Findings

### [RESOLVED — was MEDIUM] `write_surface` reached an unbounded glob compiler that backtracked catastrophically

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-1333
- **File**: `.claude/hooks/lib/write-set-profile.mjs:36` (`globToRegex`), `.claude/hooks/lib/write-surface.mjs:18` (`MAX_STAR_RUN`)
- **Fixed by**: AC-010 (input bound) and AC-011 (linear matcher), added by amendment after the first pass.

  ```
  before:  "************************"... -> true  133913.35ms
  after:   60-star pattern             -> true       0.45ms
  ```

- **Two layers, deliberately.** `sanitizePatterns` **rejects** a member with more than three consecutive `*` — nobody writes that by hand, so the boundary refuses rather than repairs. `globToRegex` **normalises** a star run to a single `.*` — a run of N stars is `**` in every glob dialect, so it resolves to the same surface. The REJECT-never-repair rule binds the first and not the second, and the distinction is recorded at both call sites.
- **Why both.** The bound covers only the `write_surface` path this diff opened. The matcher fix also covers the two pre-existing `project.json` callers (`artifacts.diagram_profiles[].when`, `security.sensitive_globs`) that the bound never sees. AC-011's regression half verifies those two callers resolve identically after the change; `resolveProfile` still returns `non-architectural` for a docs/skills write set and `full` for a `security.sensitive_globs` path.

### [MEDIUM] The same defect is copied into at least four other live modules

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-1333
- **Files** (each declares its own private `globToRegex` with per-star emission):
  - `.claude/hooks/spec_design_calls_guard.mjs:62`
  - `.claude/hooks/lib/common.mjs:482`
  - `.claude/skills/triage/governance-class.mjs:56`
  - `.claude/skills/harness/rightsize-gate.mjs:37`
- **Evidence**: `rightsize-gate.mjs` exports `matchesAnyGlob` at line 55. A probe against a 300-character path with a 60-star pattern **timed out at 25 s** where the fixed module returns in 0.45 ms. The other three match the same source shape (`c === '*'` with a single-lookahead `i++`), which is exactly the emission that produces adjacent unbounded groups.
- **Not yet assessed**: `.claude/skills/spec-lint/lint.mjs:155` has a different shape and needs reading before it is called safe or unsafe. The four `impeccable/` copies are vendored third-party and were not reviewed.
- **Impact**: `rightsize-gate.matchesAnyGlob` runs on every post-`tdd` gate against `project.json → tdd.test_globs`. A pathological glob there hangs the harness. The input is repo-local config rather than user text, so this is a self-inflicted denial of the developer's own session — the same severity as the finding it mirrors, for the same reasons.
- **Recommendation**: one spec, one change: hoist `globToRegex` into a shared foundation module and delete the copies, or apply the run-collapse to each. Prefer hoisting — nine copies of a matcher is nine chances for this to come back. Note that the self-containment convention (`landmarks/…write-set-profile…`) exists for a reason a hoist must answer: a hook lib importing another hook lib was the thing that convention forbade.
- **Explicitly out of scope here**: these files are untouched by this diff. Fixing four modules across three subsystems inside a cleanup pass is the scope expansion the `/simplify` guardrail refuses. Filed for a follow-up spec.

### [LOW] Path-traversal guard verified, not merely asserted

- **OWASP**: A01 | **CWE**: CWE-22
- **File**: `.claude/hooks/lib/write-surface.mjs:22` (`isDeclarablePattern`)
- **Evidence**: `pathOverlapsWriteSet('.claude/x.mjs', ['../../etc'])` returns `false`; absolute paths and drive prefixes are dropped alongside `..` segments.
- **Impact**: None observed. `write_surface` members are never used to construct a filesystem path — only string-compared against entry paths — so traversal has no sink even without the guard. Defense in depth, correctly rejecting rather than normalising.

## Dependencies

No package added, removed, or version-changed. `git diff HEAD -- package.json` is empty. The changed foundation modules import only `node:fs` and `node:path`, preserving the `zero-runtime-dependencies` property both elements `rests_on`.

## Out of scope / Noted

- **The blast-radius miss is the lesson of this review.** The first pass named the pre-existing exposure but scoped it to "the two `project.json` callers" of one module. It never asked whether the function was duplicated. It is, nine times. A finding about a copied helper is incomplete until the copies are counted.
- **Secrets scan**: clean.
- **No trust boundary added**: no HTTP handler, CLI entrypoint, message consumer, or deserializer. `readWriteSurface` reads one repo-local JSON file inside a `try` and returns `[]` on every failure.
- **No security linter configured** (`lint.cmd` is `null`); none was installed.

