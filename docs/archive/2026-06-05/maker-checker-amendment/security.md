# Security reports — maker-checker-amendment

## maker-checker-amendment-2026-06-05.md

# Security Review — maker-checker-amendment — 2026-06-05

## Summary

Overall risk: **LOW**. The diff is a constitutional/governance-text amendment (`seed.md §II.A` + four mirror files + annex narrative) plus a single line-number update in a test's allow-list. There is no product code, no new executable path, no dependency, and no network/IO/trust boundary in the diff. The change *strengthens* governance posture rather than weakening it. No findings above LOW.

## Findings

### [LOW] Graduation gate defers checker-oracle security review to a future phase (by design)
- **OWASP**: A04 - Insecure Design (informational) | **CWE**: n/a
- **File**: `docs/init/seed.md` §II.A clause 7(c)
- **Evidence**:
  ```
  (c) a clean `/security` review of the checker's oracle artifacts;
  ```
- **Impact**: None in this amendment. The checker's runtime oracle artifacts do not exist yet; clause 7(c) correctly makes a clean security review a *precondition* for graduation (lifting the cap), so the future executable surface is gated, not ignored.
- **Recommendation**: No action now. When the maker/checker round-trip is exercised under the charter, run `/security` on the checker's actual oracle-execution code before counting graduation criterion (c) as met.

## Targeted assessment (the three questions in scope)

1. **Does `§II.A` weaken any existing structural guarantee?** No. The charter is explicitly subordinate ("Notwithstanding the general rule … subject to **all** of") and clause 3 *mandates* that all workflow-agent writes remain under the live PreToolUse hooks. It touches no hook, no consent gate, and no write-boundary enforcement. It is additive and tightening, not loosening.
2. **Does the carve-out create an ungoverned write path?** No — the opposite. Clause 1 requires an explicit `write_set`; clause 3 requires hook governance (PoC-confirmed: `tdd_order_guard`, `verify_pass_guard`, `swarm_boundary_guard` fire on workflow agents); clause 4 bounces any scope/`write_set` escalation up to main context. No ungoverned path is introduced.
3. **Does the python3-ledger edit weaken the no-python3-runtime guarantee?** No. The edit changes a line *number* (652→666) in `ALLOWED_LINES['docs/init/seed.md']`, a positional pointer to a pre-existing **historical** python3 mention (the §16 backlog bullet narrating the past bash+python3→.mjs port). It adds no python3 mention and no python3 runtime dependency. `tests/governance-no-python3-runtime.test.mjs` still forbids any python3 mention outside the allow-listed historical lines — confirmed green (no mention outside {14, 169, 666}).

## Secrets hygiene

Scanned the changed files for hardcoded credentials. No tokens, API keys, private keys, or `.env` leakage. The grep hits (`secrets`, `consent`, `token`) are all governance *prose* describing the existing consent/randomness machinery, not literals.

## Dependencies

None. No package added, removed, or version-changed in this diff.

## Out of scope / Noted

- The charter codifies oracle-binding (mechanical evidence blocks; opinion does not) and anti-circularity (the checker's oracle derives from spec, not the maker's code). Both are *positive* security properties: they prevent a maker/checker pair from rubber-stamping each other's output (the "two LLMs agree on a hallucination" risk).
- Full test suite green (824 pass / 0 fail / 13 skipped) and `audit-baseline` PASS at review time — the structural enforcement layer is intact post-amendment.

