# Security reports — non-ui-oracle-c5

## non-ui-oracle-c5-2026-07-15.md

# Security Review — non-ui-oracle-c5 — 2026-07-15

## Summary

Overall risk: **LOW**. Two read-only checker adapters + registry wiring + a run-as-script
guard + two default-off config flags. No CRITICAL/HIGH/MEDIUM findings, no new dependencies,
no secrets. Both adapters are fail-open and gated off by default.

## Findings

### [LOW] ac-conformance — spec path is slug-guarded (no traversal)
- **OWASP**: A03/A01 | **CWE**: CWE-22 (checked, mitigated)
- **File**: `.claude/skills/harness/checkers/ac-conformance.mjs`
- **Evidence**: `run(ctx)` refuses any `ctx.slug` not matching `/^[a-z0-9][a-z0-9-]*$/` before
  building `docs/specs/<slug>.md`, and `checker-fanout` already calls `assertSafeSlug` upstream.
  `extractAcIds` is a pure regex over the spec text; `diffContent.includes(id)` has no sink.
- **Impact**: none — a hostile slug is rejected before any path is constructed.
- **Recommendation**: none.

### [LOW] mutation-score — dev-only engine is runner-injected, never shipped
- **OWASP**: A08 Software & Data Integrity | **CWE**: CWE-829 (checked, mitigated)
- **File**: `.claude/skills/harness/checkers/mutation-score.mjs`
- **Evidence**: the shipped adapter names no dev-tree module and contains no `import` of the
  mutation engine; the score comes from `ctx.oracleRunner`, injected by the baseline's own
  integrate phase (dev tree). Disabled flag / no target / no runner → `{findings:[]}`, and a
  runner throw is caught → fail-open. The engine (Stryker devDep, `scripts/`) never reaches a
  consumer install (enforced by `tests/mutation-oracle.test.mjs`).
- **Impact**: none — no untrusted input reaches a command/path sink in shipped code.
- **Recommendation**: none.

### [LOW] drift_check run-as-script guard
- **OWASP**: A04 | **CWE**: n/a
- **File**: `.claude/skills/tdd/drift_check.mjs`
- **Evidence**: `main()` now runs only when executed as a script (realpath both sides), so
  importing `extractAcIds` no longer fires the CLI (or `process.exit`). No security surface;
  strictly safer (a stray import can no longer terminate the importer).
- **Recommendation**: none.

## Dependencies

No new packages. Stryker remains a devDependency, never shipped (asserted by the existing
`test_when_files_whitelist_and_buildout_then_no_stryker_or_wrapper_shipped`).

## Out of scope / Noted

- Both oracle flags ship `false`; enabling `ac_conformance` (BLOCKER-on-miss) is a maintainer
  choice that only affects the baseline's own landings, never a consumer.

