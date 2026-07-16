# Brainstorm brief — gate-collapse

## Actor

The human reviewer operating the harness — the person who answers the workflow consent gates. Not "users"; the single engineer/owner on the hook for approvals in a standard solo workflow.

## Trigger

Every standard (solo) workflow run. Today the human is pulled back in at three separate touchpoints across one feature, each a context-switch after an idle wait.

## Current State

Three human touchpoints per workflow: (1) /approve-spec (gate A, fires after the spec is drafted), (2) /grant-commit (gate C, at commit), plus (3) a distinct governance-review attention step. Measured on the ERP consumer: ~37% of a feature's wall-clock was human latency at these gates (Decision Ledger #0001 — attention as a governed resource). Each touchpoint is a separate context-switch and latency window; the system finishes a phase and silently waits.

## Desired State

Two higher-signal human gates. (1) approve-direction — locked EARLY at intake, carrying the CO-A provenance evidence (demonstrated understanding + risk acceptance); the human authorizes the build direction ONCE and is never again asked to eyeball structure. This ELIMINATES the human /approve-spec gate: the spec and implementation between the two gates are machine-checked (checker fan-out, spec-shippability-review, drift-check, spec_design_calls_guard, the C4 design-judge) with no human spec gate. (2) approve-landing — the commit consent (/grant-commit), unchanged. When governance.class.enabled is OFF (today's default), the flow degrades to exactly these TWO gates — never the further single-authorization collapse. The 2->1 collapse for low-blast-radius work activates ONLY when Class is ON and the work is low-Class (per the Governance Class floor).

## Non Goals

- No consent gate becomes Claude-satisfiable. The intake direction gate must be a real user-typed consent command routed through the forge-proof, provenance-anchored channel (consent_gate_grant UserPromptSubmit marker + PreToolUse guard) — Claude can never write the approval token or the marker.
- Not removing review — concentrating it into one high-signal direction decision plus mechanical enforcement of everything downstream.
- Not enabling the governance-class machinery (governance.class.enabled) as part of this change; the collapse must degrade cleanly when it is off.
- Not silently dropping swarm-plan approval (gate B). Its placement once /approve-spec is gone is an OPEN QUESTION the spec must settle, not a default drop.

## Solution Leakage

The brief's framing — "fold the three gates into two", "approve-direction", "approve-landing" — is the committed spec direction from docs/handoff/velocity-notifier-and-gate-collapse.md (CO-E), recorded as build-to-spec design rather than probed as leakage. OPEN QUESTIONS carried to /spec: (a) REVISES CO-E AC2 — with direction locked at intake the CO-B reference target does not yet exist, so the human direction gate carries CO-A evidence ONLY; the reference/quality target is machine-enforced at spec time (spec_design_calls_guard presence + design-judge quality), not human-gated. The spec must formalize this as an amendment to CO-E AC2. (b) Where does swarm-plan approval (gate B) land once the human /approve-spec gate is removed — folded into approve-direction, or retained as a distinct parallel-dispatch consent? (c) What becomes of the existing /approve-spec machinery (spec_approval_guard, the consent_gate_grant marker, spec-content-hash re-check) — repurposed to anchor the intake direction gate, or removed? This is a Class-A consent-flow restructuring: amends Article IV (gate sequence) and REQUIRES a seed.md amendment FIRST (Art. I.4 precedence), then the manifest regen.
