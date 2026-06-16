# Security reports — tier-oracle-floor-dial

## tier-oracle-floor-dial-2026-06-17.md

# Security Review — tier-oracle-floor-dial — 2026-06-17

## Summary

Overall risk: **LOW**. The change adds a config accessor (`tier-dial.mjs`) that reads
repo-owned `project.json` tier config, a dev-only mutation-oracle surfacing step, and
documentation markers. No untrusted input crosses a trust boundary, no new dependency,
no secret, no execution sink. `npm audit`: 0 vulnerabilities. No CRITICAL/HIGH/MEDIUM
findings.

## Findings

### [LOW] Accessor reads attacker-influenced config keys by name — confirmed safe
- **OWASP**: A03 Injection (prototype pollution sub-class) | **CWE**: CWE-1321
- **File**: `.claude/hooks/lib/tier-dial.mjs:78` (`overrideFor`), `:88` (`pick`)
- **Evidence**:
  ```
  function overrideFor(block, checker) {
    return isPlainObject(block.overrides) && isPlainObject(block.overrides[checker])
      ? block.overrides[checker] : {};
  }
  ```
- **Impact**: A hostile `project.json` could place a `__proto__`/`constructor` key under
  `tier.overrides`. Analyzed: the accessor only **reads** `overrides[checker]` and emits
  a **fresh** object literal `{tier, checker, floor, ceiling, mandatory, source}` — it
  never `Object.assign`s onto a shared target or writes a computed key, so no prototype
  pollution occurs. A non-numeric `floor` would flow to the oracle as inert data
  (comparison yields `NA`/`BELOW`), never code. Trust level: `project.json` is committed,
  repo-owned config — the same trust as `git.protected_branches` and every other key.
- **Recommendation**: None required. Keep the fresh-object-literal return shape (do not
  refactor to a mutating merge in piece 4/5); that property is what keeps it safe.

## Dependencies

No new packages in this diff. `package.json` unchanged. `npm audit --omit=dev`: found
0 vulnerabilities. Stryker (`@stryker-mutator/core@9.6.1`) was already integrated by
piece 3 and is a devDependency invoked only by the dev-only oracle.

## Out of scope / Noted

- **A04 Insecure Design — advisory invariant is a security control (positive).** The
  mutation oracle never writes `.claude/state/last_test_result` and exits 0 regardless
  of score-vs-floor (AC-005, tested). It has no authority to gate — there is no
  privilege to escalate this slice. This is the correct posture.
- **Forward note for piece 5 (blocking).** When the stop-rule wires the `mandatory`
  flag + floor into actual gating, the tier dial becomes a **security-relevant control**:
  a missing/lenient `tier.level` (defaults to `internal-tool`) would then weaken the
  gate, and the `ceiling-below-floor → red-state → yield` rule must not be silently
  downgradable (the spec already calls this out, mirroring `verify_pass_guard`'s
  PASS-when-FAIL lesson). Out of scope here (advisory-only), flagged for the piece-5
  threat model.
- **No change to the oracle's existing `spawnSync('npx', ['stryker', ...])`** — that
  exec predates this diff (piece 3); this change adds only pure score computation, a
  stdout line, and extra advisory-report fields. No new command/exec/path-from-input.

