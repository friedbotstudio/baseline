# <one-line title — the request as a sentence>

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

<What is broken, missing, or unacceptable today? Who experiences it? When?
Include the smallest concrete scenario a reader can picture. Avoid abstractions
like "improve performance" — say "P95 of /api/orders is 2.3s, target is <500ms".>

## Goal

<One sentence. The outcome, in the user's or business's terms, not the
implementation's. "Webhook retries succeed without manual intervention" —
not "add exponential backoff to worker loop".>

## Non-goals

<At least one. What are we explicitly NOT doing? This is the primary scope-
creep defence.>

- <non-goal 1>
- <non-goal 2>

## Success metrics

<How will we know this worked? Prefer numbers over adjectives.>

- <metric> — baseline: <current>, target: <new>, measured via: <source>

## Stakeholders

<Named people or teams on the hook, not roles.>

- **Requester**: <name>
- **Reviewer**: <name>
- **Operator** (who runs it in prod): <name>

## Constraints

<Things that narrow the solution space. Technical (must run on existing infra),
regulatory (PII handling), timeline (ship by X), or human (team on vacation).>

- <constraint>

## Acceptance criteria

<Numbered, testable. Each criterion should translate to at least one test.>

1. <given X, when Y, then Z>
2. <given X, when Y, then Z>

## Open questions

<Questions the intake could not resolve. These block the next phase until
answered.>

- <question>
