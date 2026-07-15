# Security reports — enforcement-oracle-framework

## enforcement-oracle-framework-2026-07-15.md

# Security Review — enforcement-oracle-framework (C2+C3+C4) — 2026-07-15

## Summary

Overall risk: **LOW** (after remediation). The diff adds mechanical, read-only oracle checkers, a fail-closed RALPH loop, and a Playwright design-judge — no network endpoint, no secret, no crypto, no new dependency. One **MEDIUM ReDoS** was found in a new regex and **fixed in this workflow**. Path isolation, fail-closed semantics, and the Article II one-subagent invariant all hold. No CRITICAL/HIGH.

## Findings

### [MEDIUM — FIXED] ReDoS (O(n²)) in the diagram oracle's class-DDL check
- **OWASP**: A04 Insecure Design | **CWE**: CWE-1333 (Inefficient Regular Expression Complexity)
- **File**: `.claude/skills/spec-diagram-review/oracle.mjs` (`checkClassDDL`)
- **Evidence** (before fix):
  ```
  for (const m of content.matchAll(/\+?\s*(\w+)\s*:[^<\n]*<<(new|changed)>>/g)) { ... }
  ```
- **Impact**: a global `(\w+)\s*:` scan over the whole spec backtracks across every start position on a long word-char run with no colon. Measured: a 50k-word-char class field took **~2.4 seconds** (both the class-check and, since all checks run, the container fixture). The diagram oracle runs at the spec-review boundary on every spec, so a pathological (author-authored) spec self-DoSes the review. Input is author-controlled dev-time spec content, not a remote endpoint — hence MEDIUM, not HIGH.
- **Recommendation / fix applied**: line-scoped + `^`-anchored the field scan so it is O(n) (class fields are one per line). Re-measured: **1.9ms** (class), **0.2ms** (container). Behavior preserved — `tests/checker-oracle-diagram.test.mjs` + `tests/eof-review-oracles.test.mjs` green.

### [LOW] design-judge passes mechanically on unparseable quality criteria
- **OWASP**: A04 Insecure Design | **CWE**: CWE-20 (accepted by design)
- **File**: `.claude/skills/harness/design-judge.mjs` (`criterionMet`)
- **Impact**: a `qualityCriteria` string the mechanical scorer cannot parse is treated as met (returns `true`), so a spec with vague criteria passes the mechanical judge. This is the same presence-vs-truthfulness boundary as B1: the judge trusts B1's spec-quality floor (which forces *measurable* criteria) upstream, and the advisory vision read covers subjective fidelity. Not a vuln — a governance-completeness boundary; the human reviewer catches vague criteria at gate A.
- **Recommendation**: none required. Documented as the intended contract (D1).

### [LOW] Code-review fan-out is fail-open on a disabled flag
- **File**: `.claude/skills/integrate/SKILL.md` (Step 3.5), `.claude/skills/harness/checker-fanout.mjs`
- **Impact**: `velocity.code_review.enabled: false` (or absent) silently skips the code-review gate at integrate — a disabled gate gives no BLOCKER. This is the deliberate per-project opt-out (D8's opt-out posture applies to the whole gate too). A9 (logging): the skip should be surfaced, not silent.
- **Recommendation**: log the skip when the flag is off (advisory); the opt-out itself is intended.

## Dependencies

No new packages. The design-judge's production capture uses the `playwright` MCP (already declared in `.mcp.json`); tests inject a fake capture (the sole sanctioned mock — the browser can't run in the test env). No CVE surface added.

## Verified (no finding)

- **Path isolation (CWE-22)**: the code-review projection writes ONLY `.claude/state/checker-fanout-code/<slug>.json` (`persistVerdict`'s `dir` is fixed by phase, and it `return`s before the gate-A mirror) — it can never write the gate-A `.claude/state/checker-fanout/<slug>.json`. `assertSafeSlug(slug)` still guards `runCheckerFanout`'s entry for both phases. `design-judge` stamps `<rootDir>/.claude/state/last_test_result` with no slug interpolation.
- **Fail-closed RALPH (no silent PASS)**: `runRalph` returns RED on null/broken deps, a throwing checker, or a threshold error — never a silent PASS. A grounded finding persisting at the ceiling → RED that yields to a human (never advisory).
- **design-judge cannot write a false PASS**: it only ever *writes* a FAIL stamp (below threshold); PASS writes nothing. The no-browser path returns SKIP and writes nothing (verified: `tests/eof-design-judge.test.mjs`).
- **Article II (§II.A clause 6)**: `ralph-loop` calls injected mechanical `runChecker`/`runMaker` — no `Task` tool, no LLM, no subagent. `checker-fanout` runs oracles via `Promise.all` (mechanical scripts). `maker-checker.assertBounded` (1 maker / 1 checker) is unchanged and test-verified.
- **Gate-A contract unregressed**: the spec-review projection path, shape, and CLEAN/BLOCKED semantics are byte-compatible; `spec_approval_guard.mjs:72` reads the same file. Full suite (1642 tests) + audit green.

## Out of scope / Noted

- **tier-dial D8 is a hardening, not a weakening.** The prior-art landmine (`tier-dial-oracle-floors`) warned "a lenient/missing tier weakens the gate once blocking is real." D8 sets the new checkers `mandatory=true` across **all** profiles (including `internal-tool` and the `FALLBACK_TIER`), so a missing/lenient `tier.level` does NOT drop the new checkers to advisory — blocking-by-default (opt-out) closes exactly that hole.
- The write_set-extraction / glob duplication (guard/lint/write-set-profile) remains pre-existing (B1 follow-up); untouched here.

