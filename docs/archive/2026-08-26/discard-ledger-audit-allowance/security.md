# Security reports — discard-ledger-audit-allowance

## discard-ledger-audit-allowance-2026-08-26.md

# Security Review — main — 2026-08-26

## Summary

Overall risk: **LOW**. The change touches three surfaces — the baseline audit's memory-file roster, the SessionStart injection's budget arithmetic, and the shipped pre-commit hook's invocation form. No trust boundary is crossed, no dependency is added, and no secret material is handled. One MEDIUM-adjacent question (whether dropping `exec` weakens the gitleaks gate) was checked and resolved as no change in enforcement.

## Findings

### [LOW] The audit's memory allowance widens by one fixed name

- **OWASP**: A08 - Software and Data Integrity Failures | **CWE**: CWE-1104
- **File**: `.claude/skills/audit-baseline/checks/memory.mjs:35`
- **Evidence**:
  ```js
  const unexpected = [...diskMemory]
    .filter(x => !ctx.EXPECTED_MEMORY_FILES.has(x) && !ctx.OPTIONAL_MEMORY_FILES.has(x))
    .sort();
  ```
- **Impact**: The audit is a drift check over a developer's own tree, not an integrity boundary against an attacker — it reports on files the local `/memory-sync` wrote. Widening it means one specific filename no longer raises a drift row. `OPTIONAL_MEMORY_FILES` is a fixed one-element Set, not a pattern or a glob, so the widening cannot be extended by anything on disk. Every other unexpected file still fails.
- **Recommendation**: None. Keeping the roster a literal Set rather than a pattern is what bounds this; a future entry should follow the same form.

### [LOW] The envelope search costs O(log n) serializations of the whole payload

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-407
- **File**: `.claude/hooks/lib/memory_session_start.mjs:99`
- **Evidence**:
  ```js
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (serialize(clampTo(text, mid)).length <= limit) low = mid;
    else high = mid - 1;
  }
  ```
- **Impact**: Speculative, and stated as such. Each probe serializes a slice of the composed index, so a pathologically large memory store costs about twenty JSON encodings at session start rather than one. The input is the developer's own `.claude/memory/` tree and the composed text is already bounded by the head clamp before the search runs, so there is no attacker-controlled growth path. The prior code did one encoding per pass and capped at eight; this does about twenty and is exact.
- **Recommendation**: None. If session-start latency ever becomes measurable, clamp the composed text once by a raw-character estimate before the exact search rather than reintroducing the estimate as the answer.

## Dependencies

No packages added, removed, or version-changed. `package.json` and `package-lock.json` are untouched in this diff.

## Out of scope / Noted

**The pre-commit hook's enforcement is unchanged.** Dropping `exec` was checked specifically, because replacing a process is not obviously equivalent to calling one. With `exec`, the gitleaks script becomes the shell and its exit status is the hook's. Without it, the script runs as a child and `set -euo pipefail` (line 9) aborts on a non-zero exit; the call is also the last statement, so its status is the hook's status either way. A commit carrying a leak is rejected in both forms. What changes is that a check a consumer appends below the call now actually runs — previously it was unreachable, which is a silent gap in the consumer's own gating rather than in this one.

`gitleaks protect --staged` reports no leaks. Nothing is staged yet, so that result binds only at commit time, where the hook re-runs it.

