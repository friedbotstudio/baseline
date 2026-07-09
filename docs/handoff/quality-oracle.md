# Change Order — CO-C: Quality-oracle with teeth (checker bound to a ground-truth oracle)

> **Pickup instructions.** Self-contained requirement brief; no brainstorming on the *what/why* (the
> thought-compiler already settled the model). Large — run as its own **epic** in the baseline. **Depends on
> CO-B** (`spec-quality-floor.md`) for the rubric. Class-A change. Authored from the ERP consumer session
> 2026-07-08. This is the **keystone of the enforcement half** of the disease-cure roadmap.

---

## Problem

The pipeline has **no oracle for quality** — it verifies conformance to the spec and reports green even when
the artifact is mediocre. The one quality-adjacent mechanism, the ERP's ADR-0044 design-judge, is an
**advisory on a single UI** with no teeth and no generality. The result: a hand-rolled CRUD demo passed every
gate.

## Outcome

A general **checker-bound-to-a-ground-truth-oracle** capability (thought-compiler §2.2/§5) that **FAILS the
build** when an artifact misses its bar — not advisory. Its first instance is a **design-judge**: it captures
the rendered screen (Playwright) and scores it against the spec's **reference target** (from CO-B), failing
the build below threshold. "Green" finally means "good."

## Design direction (thought-compiler §5.1–§5.5 — execute it)

- **The load-bearing principle (§2.2).** A checker self-corrects only if it stands on a **mechanical oracle**;
  two LLMs left to converse agree on a hallucination. LLM-judgment is allowed only where no oracle exists and
  must be labeled lower-confidence. The design-judge's "teeth" therefore come from a **threshold on a
  comparison to the reference rubric** (a real anchor), plus a human-yield on uncertainty — never from an
  unanchored LLM opinion.
- **Checker = adversarial oracle-author (§5.1).** A finding **with a concrete artifact** (a below-threshold
  score against the reference, a surviving mutant, a failing security test, a SAST line) → **blocks**. A
  finding that is **only an assertion** ("feels off") → advisory, labeled lower-confidence, **backlogged with
  its proof obligation**, never silently dropped.
- **Termination: floor + ceiling, never conflated (§5.4).** Floor = the quality threshold in the checker's own
  unit (design-judge score; mutation score for TDD). Ceiling = effort budget (N rounds / T tokens).
  **Ceiling-hit-below-floor is a red state → yield to human**, never a silent downgrade to advisory (that
  recreates the `verify_pass_guard` PASS-when-FAIL failure).
- **The design-judge (first checker).** Playwright captures the live rendered screen (+ a11y tree); the judge
  scores it against the CO-B reference target; below threshold → `verify` FAILS. The ERP's ADR-0044 prototype
  (`ui-drift-check` bundle + `ui-design-guardian` verdict) folds in as the proven starting implementation.
- **Sibling checkers.** The same framework hosts the **mutation oracle** (TDD floor = mutants killed, not line
  coverage — the gameable fake oracle), SAST/CVE (security), and AC-conformance (the merge oracle). Each
  splits into an oracle-bound part (blocks) and a judgment part (advisory).
- **Config: threat/value tier dial (§5.5).** `project.json` tiers (`internal-tool` / `customer-data` /
  `regulated`) set, per checker, which oracles are mandatory vs advisory and the floor/ceiling values — so
  "how hard do we look" and "when to stop" are pinned config, not per-run judgment. Same pattern as
  `git.protected_branches`. This is the shared spine with the CO-A Governance Class (both are the tier dial).
- **Where it runs.** In `verify` / governance-review; the oracle-bound verdict **BLOCKS** the phase.
  Arbitration: oracle-bound findings outrank judgment findings; two oracle-bound findings can't truly conflict
  (both mechanically true) — an apparent conflict means the *spec* is wrong → route to the existing
  integrate-failed→needs-spec-change→yield hatch.

## The loop it closes

CO-B (spec floor) makes the human set a **reference target**; CO-C scores the shipped artifact against **that
same target**. Input and enforcement are the two ends of one loop — the bar the human sets is the rubric the
oracle enforces. Without CO-B there is no anchor and the judge scores on vibes; hence the hard dependency.

## Dogfood, not symptom-fix

Prove the design-judge on the baseline's own `site-src` UI and, as a convenient real consumer target, the ERP
FMCG screens — strictly as a **means** to validate the general capability, **never** as an end to make FMCG
pretty (that is out of scope — see the roadmap §7).

## Acceptance criteria

1. A UI artifact scoring **below its reference threshold FAILS `verify`** (build-blocking, not advisory).
2. The judge scores against the spec's **reference target** (CO-B), not unanchored taste; the comparison is
   inspectable.
3. Oracle-bound findings **block**; assertion-only findings advise, are labeled lower-confidence, and are
   backlogged with a proof obligation.
4. **Ceiling-below-floor yields to a human** — no silent downgrade of a below-floor result to "advisory."
5. The framework is general: at least one non-UI oracle (mutation score for TDD **or** AC-conformance) rides
   the same checker interface, proving it is not a one-off UI hack.

## Constraints / governance

- Baseline-owned, manifest-hashed: `verify`, governance-review machinery, a new checker/oracle framework, the
  design-judge (LLM-judge + Playwright capture), the threat/value tier config. Regenerate the manifest.
- **Depends on CO-B** (rubric). Do not ship the design-judge with teeth before the spec floor exists, or it
  blocks on an anchor that isn't there.
- Class-A; run through the baseline's own gates. Keep it dependency-light (U6): prefer Playwright (already a
  declared MCP) + an LLM-judge over any irreplaceable third-party visual-diff service.

## Cross-references

- `office/docs/vision/baseline-v1-thought-compiler.md` — §2.2 (oracle principle), §5.1–§5.5 (checker model).
- `docs/handoff/spec-quality-floor.md` (CO-B) — the rubric this enforces (hard dependency).
- `docs/handoff/brainstorm-critic.md` (CO-A) — produces the better specs whose bars this enforces.
- ERP `docs/adr/0044-*` + backlog `build-adr-0044-llm-drift-judge-slice-b3d2` — the prototype that folds in.
