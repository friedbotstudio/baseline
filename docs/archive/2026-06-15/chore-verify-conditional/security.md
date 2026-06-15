# Security reports — chore-verify-conditional

## chore-verify-conditional-2026-06-15.md

# Security Review — chore-verify-conditional — 2026-06-15

## Summary

Overall risk: **LOW**. The change is governance prose, a `project.json` config key (`test.kind`), a skill SOP edit (chore), a recommender SKILL edit, and two content-assertion test files. No executable runtime module, no trust boundary, no network/IO/parsing surface, no dependencies added. The single security-relevant concern is the integrity of the chore `verify` gate now that it can be conditionally skipped; the design is fail-safe (conservative default + strict trigger), so residual risk is low.

## Findings

### [LOW] Verify-gate skip relies on correct pure-docs classification
- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-754 (Improper Check for Unusual Conditions)
- **File**: `.claude/skills/chore/SKILL.md:51-58` (conditional `verify` trigger), `.claude/skills/chore/SKILL.md:84` (Step 4 gating)
- **Evidence**:
  ```
  Skipped only when both hold:
  - the diff is pure-docs/prose only (every changed path is docs/prose; no code/config/script path)
  - project.json -> test.kind is "behavior"
  Otherwise run verify. Any code/config/script path runs verify regardless of test.kind.
  ```
- **Impact**: If a code/config change were misclassified as "pure-docs", the chore track would skip `verify` and the change could land without its structural/behavior gate. In this repo the classification is performed by the model reading the SOP (no runtime parser), so this is a process-integrity risk, not an exploitable code path.
- **Recommendation**: The design already mitigates this correctly — (a) the trigger requires **both** pure-docs **and** `test.kind == "behavior"`; (b) **any** code/config/script path forces verify regardless of `test.kind`; (c) an absent/invalid `test.kind` resolves to the conservative `structural` (verify runs). Keep the path set in the trigger explicit and inclusive of all executable/config extensions. No change required.

### [LOW] Future runtime classifier (if added) must canonicalize paths
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-22 (Path Traversal) / CWE-59 (Link Following)
- **File**: design note — no runtime classifier exists in this change
- **Impact**: This change deliberately keeps the test.kind resolution and pure-docs classification as documented rules, not code. If a future workflow promotes the classification to an automated helper, a naive path check could be fooled by symlinks, `./`-prefixes, or a non-`.md` file masquerading via extension tricks — letting a code change skip verify.
- **Recommendation**: Should the classification ever become a runtime module, canonicalize each diff path (resolve symlinks/`realpath`, normalize `./`) and classify by the resolved path, defaulting any unrecognized path to "not docs" (verify runs). Tracked as guidance, not actionable now.

## Dependencies

No packages added or upgraded in this diff. The only library referenced is `vitest@4.1.6`, and only as a *recommended* command string in `claude-automation-recommender/SKILL.md` — it is not a dependency of this repo. No CVE check applicable.

## Out of scope / Noted

- `test.kind` lives in `project.json`, the same trust level as the existing `test.cmd`. Anyone who can edit `project.json` already controls the test command entirely, so `test.kind` introduces no new privilege.
- No secrets, crypto, authn/authz, injection, or SSRF surface in the diff.
- No security linters are configured for this meta-tooling repo; `npm audit` is not applicable (no production dependency change).
- `.claude/memory/landmarks.md` shows in the working tree but is auto-extracted memory, not part of this change's logic.

