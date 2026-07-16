# Security reports — gate-collapse

## gate-collapse-2026-07-16.md

# Security Review — gate-collapse (D3/CO-E) — 2026-07-16

## Summary

The forge-proof, provenance-anchored consent property is **INTACT** — the rename preserved every structural guarantee (marker written only outside Claude's tool boundary; guard blocks marker self-write + spec self-approval; token path unchanged so the epic root is preserved; A4 anchor still gated). Two findings on the **relocated** enforcement were raised and **both FIXED in-place this phase** (fix-in-place per the harness decision tree, since they were incomplete-implementation bugs). Residual risk after fix: **LOW**.

## Resolution (applied 2026-07-16, re-verified green: 1750 tests pass, audit PASS)

- **HIGH — checkpoint not wired → FIXED.** Added an explicit pre-implementation-checkpoint step to the harness SOP (`.claude/skills/harness/SKILL.md` phase-ordering): after `spec-shippability-review` + checker fan-out, before `implementation`, the harness calls `checkImplementationReady` and EXITS with YIELD on a BLOCKED verdict. Regression-guarded by `tests/gate-collapse-impl-checkpoint.test.mjs → test_when_harness_sop_read_then_it_wires_the_checkpoint_before_implementation`.
- **MEDIUM — CWE-22 unvalidated slug → FIXED.** `pre-implementation-gate.mjs` now imports and calls `assertSafeSlug(slug)` (REJECT, never repair) before any path is constructed — parity with the sibling `checker-fanout` reader. Guarded by `test_when_slug_has_traversal_then_throws`.
- Also corrected a rename-induced temporal error: the checker-fanout SOP bullet said "before `approve-direction`" (which is now at intake) — corrected to "before `implementation`".

## Findings

### [HIGH · RESOLVED] Relocated BLOCKED-verdict enforcement was not wired into the harness loop
- **OWASP**: A08 - Software and Data Integrity Failures | **CWE**: CWE-840 (Business Logic Errors) / CWE-693 (Protection Mechanism Failure)
- **File**: `.claude/skills/harness/SKILL.md` (phase ordering — no pre-implementation checkpoint step) ; `.claude/skills/harness/pre-implementation-gate.mjs:37` (helper exists but has no caller)
- **Evidence**:
  ```
  # grep for the wiring finds only a passing mention in the durable-plan note,
  # never a loop step that invokes checkImplementationReady before implementation:
  $ grep -rn "checkImplementationReady\|pre-implementation-gate" .claude/skills/harness/SKILL.md
  SKILL.md:162  ...(durable-plan note reference only)...
  ```
- **Impact**: Under D-6, the gate-A guard no longer reads the shippability / checker-fanout BLOCKED verdict (correctly — the token is written at intake, before those verdicts exist). The replacement was specified (AC-007) as a harness checkpoint at the `spec-shippability-review → implementation` boundary. That checkpoint helper (`checkImplementationReady`) is implemented and unit-tested, but **nothing calls it in the harness SOP**. Net effect: a spec whose shippability or checker-fanout verdict is `BLOCKED` (e.g. a dev-tree leak, an untraceable AC) would proceed into `/tdd` implementation — the integrity control that existed pre-change (gate-A token block) has no live enforcement point.
- **Recommendation**: Add an explicit harness loop step in `.claude/skills/harness/SKILL.md` phase-ordering: after `spec-shippability-review` completes and before invoking `implementation`, run `checkImplementationReady({slug, rootDir})`; on `ready:false`, EXIT LOOP with YIELD (`reason: "spec-review BLOCKED: <sources>"`), surfacing the blockers. Fail-open on absent/malformed verdict (already the helper's behavior).

### [MEDIUM · RESOLVED] `pre-implementation-gate.mjs` built a path from an unvalidated slug (CWE-22)
- **OWASP**: A01 - Broken Access Control (path traversal) | **CWE**: CWE-22
- **File**: `.claude/skills/harness/pre-implementation-gate.mjs:40`
- **Evidence**:
  ```
  const report = readVerdict(join(rootDir, '.claude', rel, `${slug}.json`));
  ```
- **Impact**: `slug` is interpolated into a filesystem path with no validation. It reads the SAME `.claude/state/checker-fanout/<slug>.json` path that `checker-fanout` guards with `assertSafeSlug` at entry (per `docs/security/durable-plan-slug-guard-2026-07-12.md`, the established REJECT-never-repair discipline). A malformed slug (`../../etc/x`) would read outside the state dir. The slug is harness-controlled today (not a direct external boundary), so this is defense-in-depth + consistency, not an open exploit — but it is an inconsistency with the sibling reader of the identical path, exactly the gap the durable-plan review closed elsewhere.
- **Recommendation**: `import { assertSafeSlug } from './plan-store.mjs'` and call `assertSafeSlug(slug)` at the top of `checkImplementationReady`, before any path is constructed. REJECT (throw), never normalize.

## Verified INTACT (the forge-proof consent property)

Enumerated and confirmed present in the diff:
1. **Marker provenance** — the `.direction_approval_grant` marker is written only by `consent_gate_grant.mjs` (UserPromptSubmit, outside Claude's tool boundary); `writeMarkerAtomic`. Claude cannot reach that code path. ✓
2. **Guard blocks self-write** — `direction_approval_guard.mjs` calls `blockMarkerSelfWrite(rel, CONSENT_MARKER_DIRECTION_REL, …)` and blocks `Status: Approved` self-approval in `docs/specs/*.md`. ✓
3. **Fresh+slug-matched validation** — the token write under `spec_approvals/` is allowed only after `validateConsentMarker(CONSENT_MARKER_DIRECTION, …, expectedSlug)` (TTL 120s, single-use, slug-matched). ✓
4. **Epic root preserved** — token path is unchanged (`spec_approvals/<slug>.approval`), so `epic_approval_guard` / `track_guard.epicInheritanceSatisfied` keep their forge-proof root (D-2). ✓
5. **No gate Claude-satisfiable** — `CONSENT_DENY_LIST` now includes `approve-direction` (fail-closed); the gate can never be excepted. ✓
6. **A4 anchor** — provenance-anchor check retained in the guard, still gated by `governance.approval_provenance.enabled` (fail-safe block on dangling anchor). ✓
7. **Class-off fail-safe** — `gate-collapse-resolver.mjs` is a pure function; flag off / absent key / unresolved class all return the two-gate flow. It can never reduce below two gates when the flag is off. ✓ (no CWE-22 — no fs/path use)

## Dependencies

No new packages. All machinery is in-repo Node ESM. `npm audit` surface unchanged by this diff.

## Out of scope / Noted

- Stale `spec_approval_guard` prose remains in several skill SKILL.md files (brainstorm, spec, intake, design-ui) not touched by this diff — documentation-accuracy debt flagged for the `/document` phase, not a security issue.

