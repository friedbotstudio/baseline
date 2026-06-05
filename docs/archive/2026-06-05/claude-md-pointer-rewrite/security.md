# Security reports — claude-md-pointer-rewrite

## claude-md-pointer-rewrite-2026-06-05.md

# Security Review — claude-md-pointer-rewrite — 2026-06-05

## Summary

Overall risk: **LOW**. This is a governance/documentation restructure — Article X.1–X.4 elaboration relocated from `CLAUDE.md` to `.claude/CONSTITUTION.md §5`, a one-line seed §14 reword (+ template mirror), and a single test-constant tightening (`CLAUDE_TARGET_MAX` 38500 → 34000). No executable code paths, trust boundaries, input handlers, network/DB/auth/crypto surfaces, or dependencies are introduced or modified. No CRITICAL/HIGH/MEDIUM findings. The review focused on the only security-relevant axis for a constitution edit: **governance-integrity** (does the relocation weaken structural enforcement?).

## Findings

### [LOW] Binding rule elaboration moved to read-on-demand annex (accepted design tradeoff)

- **OWASP**: A08 - Software & Data Integrity Failures (governance-integrity lens) | **CWE**: CWE-710 (Improper Adherence to Coding Standards) — used analogously for governance text
- **File**: `CLAUDE.md:225-251` (Article X.1–X.4 terse clauses) ↔ `.claude/CONSTITUTION.md §5`
- **Evidence**:
  ```
  CLAUDE.md X.2: "...Bypassing `design-ui` inside a workflow phase is a
  violation of this Article. Full rule table (...): `.claude/CONSTITUTION.md §5.2` (annex)."
  ```
- **Impact**: The *elaborative* rule tables (caps, helper paths, misroute states) are no longer auto-loaded into every session; a model would read the annex on demand. The **binding clause** for each rule (the SHALL/SHALL-NOT + enforcement-hook citation) remains in always-loaded `CLAUDE.md`, so no rule loses force. This is the explicit, intake-accepted design (Art I.6 / seed §14 "carries binding rules only"); it is not a regression. Verified non-weakening below.
- **Recommendation**: None required. Keep the binding clause + a pointer in CLAUDE.md for every relocated Article (already done; `audit-baseline` PASS confirms citations intact).

## Verification of non-weakening (what was checked)

- **Hook → Article enforcement mapping (Art VIII)** — untouched by the diff (`git diff` shows no Article VIII edits; 26 hook-event references intact). All 22 hooks still map to their Articles.
- **Consent gates (Art IV gates A/B/C)** — the `approve-spec` / `grant-commit` literals and the gate table remain verbatim in CLAUDE.md (marker-survival test PASS).
- **Audit citations (Art XI / seed §17)** — `## Article XI` + `manifest` in CLAUDE.md and `## §17` + `manifest` in `src/seed.template.md` both present; `audit-baseline` exit 0.
- **Byte-equal mirror (Art XI)** — `cmp CLAUDE.md src/CLAUDE.template.md` clean; thread-shelving-governance + code-browser-primary-navigation mirror tests PASS.
- **Seed parity** — `src/seed.template.md` pre-§16 + §17 tail byte-equal to `docs/init/seed.md` (seed-template-parity + article-iv-mirror PASS); python3 ALLOWED_LINES ledger unaffected (in-place §14 reword, no line shift).
- **Test-constant change** — lowering the soft cap to 34,000 is strictly *more* restrictive (defensive). It cannot loosen any guarantee.

## Dependencies

No new packages. `package.json` / lockfile unchanged.

## Out of scope / Noted

- `.claude/memory/backlog.md` shows deletions in the working tree — these are the prior `/memory-flush` auto-close of the completed `-c732` entry, not part of this workflow's substantive change. No security relevance.
- The "read-on-demand availability" of relocated detail is a usability/comprehension consideration, not an attack surface. It was the explicit accepted tradeoff (intake non-goal: minimizing always-loaded size is not the goal; binding clauses stay always-loaded).

