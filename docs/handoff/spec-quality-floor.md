# Change Order — Spec quality floor (a spec can't be "done" without a quality bar)

> **Pickup instructions.** Self-contained requirement brief. No brainstorming needed — the problem,
> rationale, desired outcome, and acceptance criteria are below. This needs real design (the *how*),
> so run it via `/triage` → **spec-entry** (not chore): the baseline session designs the guard/skill
> change in `/spec`, then TDD. `skip_brainstorm: true`. Authored from the ERP consumer session
> 2026-07-08 after diagnosing why a mediocre UI passed every gate.

---

## Problem (the diagnosis that motivated this)

The baseline pipeline is a **conformance engine, not a quality engine**. It rigorously verifies that an
artifact matches its spec — but it has no oracle for whether the spec itself set a real bar.

Concrete failure (ERP, Epic 3 web client): the FMCG product-form spec passed **every** structural gate —
`artifact_template_guard` (sections present), `spec_diagram_presence_guard` (diagrams present),
`spec_design_calls_guard` (a `## Design calls` section present). Its acceptance criteria were all
"renders the form from served metadata." The shipped UI did exactly that — and was a hand-rolled,
CRUD-grade demo. Governance reported green because the spec was **structurally complete but
substantively thin**: it never demanded production quality or a real component system. Garbage-in-the-spec
passes every downstream gate.

The human approving at gate A saw a complete-looking document and rubber-stamped it — the gate checks
structure, not substance.

## Desired outcome

A **UI-touching spec cannot reach `/approve-spec` without a checkable quality bar.** Specifically, upgrade
`spec_design_calls_guard` (and the `/spec-lint` preflight + `/spec` template) from *"a `## Design calls`
section is populated"* to *"a **reference target** and **quality acceptance criteria** are present"* for any
spec whose `write_set ∩ project.json → tdd.ui_globs` is non-empty.

The **reference target is the rubric** the downstream design-judge oracle scores the shipped UI against
(see the ERP-side design-judge prototype, ADR-0044 — that oracle is the *enforcement* side; this floor is
the *input* side; together they close the loop: human sets the bar upstream, machine enforces it downstream).

## What a "reference target" is (checkable, method-agnostic)

Any concrete, comparable bar a judge or a human can score against:
- a named design to match ("Linear/Vercel dashboard density"),
- a screenshot or a Figma frame,
- "primitives come from the shadcn registry, not hand-rolled",
- an explicit interaction/quality AC ("empty, loading, and error states specified").

Quality ACs must be **distinct from wiring ACs** — "renders from served metadata" is wiring; "matches the
approved reference at ≥ threshold on the design-judge" is quality.

## Acceptance criteria

1. A spec whose `write_set` intersects `tdd.ui_globs` and lacks a reference target **fails**
   `spec_design_calls_guard` at the Write boundary AND `/spec-lint` preflight — it cannot reach `/approve-spec`.
2. A non-UI spec is unaffected (the floor is UI-scoped, same gating predicate as today's design-calls guard).
3. The `/spec` template prompts for the reference target + quality ACs so authors produce them by default.
4. The gate-A open-questions consolidation surfaces a missing/weak reference target as a blocker to settle.
5. Existing passing specs that pre-date this floor are not retroactively broken (grandfather or migrate; the
   guard fires on new/edited UI specs).

## Rationale to preserve

From the ERP diagnosis: ~20% of product tokens went to `spec` (the single most expensive non-build phase),
and it was *simultaneously* bloated and thin on the one thing that mattered. Fixing spec fixes cost and —
because the spec is what the build conforms to — fixes quality. The reference target also **replaces spec
prose** (a wireframe carries layout intent prose was clumsily encoding), so specs get leaner *and* clearer.

Ties to: Governance Sufficiency Model (Ledger #0002) — this is a *shape* requirement on the spec artifact,
method-agnostic (AI may draft it); Vision V2 "approval is not review."

## Constraints / governance

- Baseline-owned, manifest-hashed: `spec_design_calls_guard` (hook), `spec` skill + template, `spec-lint`.
  Editing a hook needs a **seed.md §4.1 amendment + user approval** (Article VIII). Regenerate the manifest
  (`bash scripts/build-template.sh`) after editing hashed files.
- Governance Class: touches a hook + the spec pipeline → treat as Class-A; the human approves at the
  baseline's gates.
- Do NOT weaken the existing structural guards — this is additive (a substance floor on top of the structure floor).

## Cross-references

- ERP design-judge prototype (ADR-0044) — the enforcement side; graduates to a baseline `verify`/checker.
- `docs/handoff/context7-outcome-mandate.md` — sibling amendment from the same session.
- `office/docs/vision/decision-ledger-0002-governance-sufficiency-model.md` — the shape-not-authorship principle.
