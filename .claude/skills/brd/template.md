# <BRD title — business outcome, not implementation>

<!--
Business Requirements Document. Produced by the `brd` skill.
Required sections (enforced by artifact_template_guard): Business objective,
Scope, Business requirements.
-->

## Executive summary

<Two to four sentences. What business problem are we solving, why now, and
what changes when we're done? A reader who sees only this paragraph should
know whether to care.>

## Business objective

<The outcome in business terms: revenue, cost, risk, compliance, customer
satisfaction. Tie to a specific metric where possible.>

## Scope

### In scope
- <item>
- <item>

### Out of scope
- <item — explicit exclusions that the spec cannot later quietly include>

## Business requirements

<The "what must be true for this to succeed" statements. Each has an ID so
the spec and tests can reference it.>

- **BR-001** — <requirement statement>. Rationale: <why>.
- **BR-002** — <requirement statement>. Rationale: <why>.

## Functional requirements

<How the system must behave to satisfy the business requirements. Each ties
back to a BR.>

- **FR-001** — <behaviour>. Satisfies: BR-001.
- **FR-002** — <behaviour>. Satisfies: BR-001, BR-002.

## Non-functional requirements

<Performance, security, availability, observability, compliance. Must be
measurable.>

- **NFR-001** — <e.g., P95 latency < 200ms at 500 RPS>. Rationale: BR-00X.
- **NFR-002** — <e.g., data at rest encrypted with AES-256-GCM>. Rationale:
  regulatory (specify regulation).

## Stakeholders and sign-offs

| Name | Role | Sign-off required | Status |
|------|------|-------------------|--------|
| <name> | <business owner> | yes | pending |
| <name> | <eng lead>       | yes | pending |
| <name> | <compliance>     | yes | pending |

## Dependencies

<External systems, teams, vendors, or pre-existing work this BRD depends on.>

- <dependency — owner — blocking? yes/no>

## Risks

<Named risks, each with owner and mitigation.>

- **R-01** — <description>. Owner: <name>. Mitigation: <what we'll do>.

## Timeline / milestones

<Dates tied to named deliverables. Avoid false precision — if the date is a
target, mark it "target"; if it's a commitment, mark it "committed".>

- <date> — <milestone> — target | committed

## Open questions

- <question>
