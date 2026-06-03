# Security reports — anchor-consent-write-target

## anchor-consent-write-target-2026-06-03.md

# Security Review — anchor-consent-write-target — 2026-06-03

## Summary

**Overall risk: HIGH — do not ship as-is.** The per-fragment co-occurrence refinement to `writesConsentPath` fixes the cross-fragment false-positive but introduces a guard **bypass**: a consent write whose path arrives via a shell variable assigned in a separate fragment is no longer blocked. The current (coarse whole-scan) code blocks it. Trading a false-positive (UX friction, safe) for a false-negative (a real forge, unsafe) is a net regression for a security guard.

## Findings

### [HIGH] Variable-indirected consent write bypasses per-fragment anchoring

- **OWASP**: A04 - Insecure Design (protection-mechanism weakening) · **CWE**: CWE-693 / CWE-78
- **File**: `.claude/hooks/lib/common.mjs` — `writesConsentPath` (the new `for (const frag of executedFragments(scan))` co-occurrence loop)
- **Evidence** (probe importing `writesConsentPath`):
  ```
  ALLOW | F=.claude/state/commit_consent; tee $F       <- real forge, NOW allowed
  ALLOW | F=.claude/state/commit_consent; echo x > $F  <- real forge, NOW allowed
  BLOCK | D=.claude/state; tee $D/commit_consent       <- still blocked (basename literal at use)
  BLOCK | tee .claude/state/commit_consent             <- control
  ```
  `executedFragments` performs no variable expansion. The basename `commit_consent` lives in the `F=…` assignment fragment (no write verb there); the write fragment `tee $F` has the verb but no literal consent reference, so per-fragment co-occurrence never fires. The pre-change whole-scan code blocked both (basename present anywhere + write verb present anywhere).
- **Impact**: Claude could forge a consent token via a two-fragment command using a full-path variable. Defeats the consent gate the guard backs.
- **Recommendation**: do not ship the per-fragment refinement unaltered. See Options below. Note that naive variable taint-tracking is insufficient: it must propagate through `G=$F` re-assignment, `eval`, etc., and each missed level is another bypass — which is exactly why the original guard chose coarse-but-sound whole-scan.

### [INFO] The fixed false-positive is only UX friction

- The bug this workflow targets (`head .../commit_consent; git mv a b` blocked) is an **over-block**: annoying but safe. It is mitigable by not co-locating a consent-path read with an unrelated write-verb in one command line (split into two). Weighed against the HIGH bypass, soundness wins.

## Checks performed

- **(a) cross-fragment false-positive** — fixed (the 3 target cases ALLOW). 
- **(b) direct real writes** — still BLOCK (tee/cp/mv/redirect/prog/sed-i to a literal consent path; 39/39 existing guard tests green).
- **(c) variable indirection** — **FAILS** (HIGH above): full-path var assignment + later write is allowed.
- **(d) git-commit carve-out** — retained and intact.

## Dependencies

No new packages.

## Out of scope / Noted

- A sound precision fix needs **target-anchoring with variable resolution** (resolve `VAR=value`, including propagation, then check the write verb's resolved target) OR a **strip-read-only-command-arguments** approach that removes a consent reference only when it is an argument to an unambiguously read-only command (cat/head/tail/grep/ls/wc) while PRESERVING redirect targets (so `cat X > consent` still blocks). Both are larger than a quickfix and security-critical — they belong in a spec-entry workflow with an exhaustive bypass test matrix.

---

## Re-review — spec-entry fix (target-anchored via variable expansion) — 2026-06-03

**Overall risk: LOW. The HIGH bypass is closed; no under-block found.**

The spec-entry fix (`docs/specs/anchor-consent-write-target.md`, approved) replaced the unsound per-fragment co-occurrence with **expand-then-detect**: `resolveAssignments` builds a `VAR→value` map (fixpoint over chained vars), `expandWithEnv` substitutes `$VAR`/`${VAR}` before detection, the redirect check runs whole-command (path-anchored; robust to the `>|` split), and verb/sed/prog checks run per executed fragment. Variable-indirected targets become literal consent operands before detection, so they block.

**Adversarial probe (19 vectors, all correct):**
```
BLOCK: direct; var single; var multi-level (G=$F); var redirect; var redirect ${F};
       dir-var+literal; clobber >|; git mv to consent; eval+var; executor wrapper
       (command tee); subshell; no-space quoted target; dd of=; forge-then-read
ALLOW: read + unrelated mv; read + unrelated cp; var read-only (P=consent; cat $P);
       untraceable var (tee $UNKNOWN, no literal consent); grep consent | tee /tmp
```
The three vectors that defeated the quickfix (`F=…; tee $F`, multi-level, redirect-to-var) now BLOCK. The `>|` regression found mid-implementation is fixed (whole-command redirect check). 18/18 spec matrix tests + 39/39 existing guard suites green.

**Residual / threat-model boundary (unchanged, accepted in spec §Non-goals):** a consent path entering a variable with **no literal basename** in the command (`X=$(...)`, `read X`, env, function args) is unreachable by any literal scanner, including the prior guard — `tee $UNKNOWN` is allowed. This is not a regression (the coarse guard also allowed it) and is explicitly out of scope.

**Verdict: ship.**

