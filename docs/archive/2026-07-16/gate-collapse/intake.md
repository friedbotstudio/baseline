# Gate-collapse: fold three human consent gates into two higher-signal ones (D3 / CO-E)

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Primary input: docs/brief/gate-collapse.md (brainstorm brief).
-->

## Problem

A standard solo workflow pulls the human reviewer back in at **three** separate touchpoints: `/approve-spec` (gate A, after the spec is drafted), `/grant-commit` (gate C, at commit), and a distinct governance-review attention step. Each is a context-switch after an idle wait. Measured on the ERP consumer, **~37% of a feature's wall-clock was human latency at these gates** (Decision Ledger #0001 — attention as a governed resource) — not the human being away, but the human working on something else while the system silently waited its turn.

The three touchpoints are not equally load-bearing. `/approve-spec` asks the human to eyeball a drafted spec's structure — work the mechanical checkers (checker fan-out, spec-shippability-review, drift-check, `spec_design_calls_guard`, the C4 design-judge) already do, and do more reliably. The genuinely human decision — *is this the right direction, and do I accept its risk?* — is made once but re-litigated at each gate.

## Goal

The human answers the one load-bearing question — *is this the right direction?* — **once, early, with real evidence**, and is never again asked to eyeball structure; the machine enforces everything between that decision and the commit.

## Non-goals

- **Not making any consent gate Claude-satisfiable.** The new direction gate must be a real user-typed consent command routed through the forge-proof, provenance-anchored channel (`consent_gate_grant` UserPromptSubmit marker + PreToolUse guard). Claude can never write the approval token or the marker.
- **Not removing review** — concentrating it into one high-signal direction decision plus mechanical enforcement downstream.
- **Not enabling the governance-class machinery** (`governance.class.enabled`) as part of this change. The collapse must degrade cleanly when it is off.
- **Not silently dropping swarm-plan approval (gate B).** Its placement once `/approve-spec` is removed is an open question the spec must settle, not a default drop.
- **Not touching `/grant-commit` (approve-landing) behavior** beyond its role as the second and final gate.

## Success metrics

- Human consent touchpoints per standard solo workflow — baseline: 3, target: 2, measured via: count of `needs_user` gates in the materialized `intake-full` tasklist + Article IV gate sequence.
- Human-latency share of feature wall-clock — baseline: ~37% (ERP, Ledger #0001), target: lower (fewer idle windows), measured via: `phase_timer` per-phase timing across a landed workflow (directional, not a hard gate for this change).
- Forge-proof property regressions — baseline: 0, target: 0, measured via: consent-guard regression suite (self-approval + marker-write attempts still blocked).

## Stakeholders

- **Requester**: razieldecarte (baseline project owner)
- **Reviewer**: razieldecarte (baseline project owner — sole approver at both collapsed gates)
- **Operator** (who runs it in prod): the Claude Code harness + any consumer-install session executing the `intake-full` / `spec-entry` tracks

## Constraints

- **Class-A consent-flow restructuring.** Amends **Article IV** (the gate sequence) and therefore **requires a `seed.md` amendment FIRST** (Art. I.4 precedence: `seed.md` > `CLAUDE.md` > implementation), then the manifest regen. Byte-equal mirrors (`src/CLAUDE.template.md`, `src/seed.template.md`) must stay in sync; `audit-baseline` must pass.
- **Depends on A4** (provenance-anchored `/approve-spec`) and **D1** (notifier) — both landed. The direction gate reuses A4's provenance anchor so the single approval carries real evidence.
- **Forge-proof invariant is non-negotiable.** Every gate stays generated from a provenance-anchored entry, never self-satisfiable by Claude (the `consent_gate_grant` handshake owns every approval).
- **Must degrade to today's behavior when off-flag.** With `governance.class.enabled` off, the flow yields the two-gate sequence; the further single-authorization collapse never activates.

## Acceptance criteria

1. Given a standard solo `intake-full` workflow, when the tasklist is materialized and the Article IV sequence is walked, then exactly **two** human consent gates fire — **approve-direction** (at intake) and **approve-landing** (at commit) — not three.
2. Given the direction gate, when the human attempts to approve, then approval is refused unless the CO-A provenance evidence entry exists; and given Claude, when it attempts to write the direction approval token or its consent marker, then the guard blocks it (forge-proof preserved).
3. Given `governance.class.enabled` is **off**, when any workflow runs, then the flow presents exactly the two gates and **never** collapses to a single authorization; given it is **on** and the work is low-Class, when the workflow runs, then direction+landing may collapse to a single authorization per the Governance Class floor.
4. Given a spec whose `write_set` intersects `tdd.ui_globs`, when it lacks a reference target / quality ACs, then it is still blocked at spec time by `spec_design_calls_guard` **even though no human `/approve-spec` gate reviews it** — the CO-B reference target stays machine-enforced (revises CO-E AC2: the human direction gate carries CO-A evidence only).
5. Given the change lands, when `audit-baseline` runs, then `seed.md` §-amendment + Article IV amendment are present, the byte-equal mirrors match, the manifest is regenerated, and the audit passes.
6. Given the existing consent-guard regression suite, when it runs after the change, then no forge-proof regression appears (self-approval and marker-write attempts at every gate still blocked).

## Open questions

- **Swarm-plan approval (gate B) placement.** Once the human `/approve-spec` gate is removed, where does the swarm-plan approval land — folded into approve-direction, or retained as a distinct parallel-dispatch consent fired at Phase 6? (Scope note: the swarm path is separate from the standard solo flow this change targets.)
- **Fate of the `/approve-spec` machinery.** Is `spec_approval_guard` + the `consent_gate_grant` marker + the spec-content-hash re-check **repurposed** to anchor the intake direction gate, or **removed** and replaced by a new direction-gate guard?
- **Direction-gate content anchor.** The intake document can change after the direction is approved (unlike a spec, intake is not currently content-hashed). Does the direction gate need its own content-hash anchor so a post-approval intake edit re-yields, mirroring the gate-A spec-content-hash discipline?
