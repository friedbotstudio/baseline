# Brainstorm brief — parallel-readonly-checker-fanout

## Actor

Engineer running a baseline workflow (baseline-on-baseline development; also any consumer project on the spec-entry / intake-full tracks).

## Trigger

A workflow reaches its read-only review band (spec-lint, spec-diagram-review, spec-traceability-review, spec-shippability-review, plus lint) or its discovery band (scout, research).

## Current State

These independent read-only checks execute one after another. Serial execution adds avoidable wall-clock to the run, measured across timing data points DP1-DP7 in the velocity-levers backlog.

## Desired State

The independent read-only checks execute concurrently, cutting wall-clock on the review/discovery band, while producing the same pass/fail verdict the serial run would have produced.

## Non Goals

(1) Verdicts must stay byte-identical to serial execution (engineer-emphasized primary non-goal: no nondeterminism, no dropped findings). (2) Article II preserved: judgment/decisions stay in main context; only pre-decided read-only recipes fan out. (3) No overlap of write/mutating phases or order-dependent steps; only genuinely read-only checks overlap.

## Solution Leakage

Request is solution-shaped (parallelize, run concurrently, Workflow runtime parallel()/pipeline(), subagents, background Bash). The substrate decision is deferred to /spec, which must pick one mechanism and justify it.
