# Brainstorm brief — chore-verify-conditional

## Actor

- Developer running /init-project on a vitest-based repo (inherits the generated test.cmd).
- Baseline maintainer or user running a pure-docs chore on a repo whose test.cmd is a behavior suite.

## Trigger

- (reporter) At /init-project time for a vitest project — the recommender emits the test_cmd.
- (verify trap) At the chore-track verify phase when the write_set is docs-only and test.cmd is a behavior suite.

## Current State

- Generated test.cmd `vitest run --reporter=basic` errors at startup — `basic` was removed as a vitest reporter in v4.x.
- The chore track makes verify mandatory; its PASS rule (exit 0 AND >=1 test executed AND nothing failed) assumes test.cmd is a whole-repo sanity check. When test.cmd is a narrow behavior suite, a pure-docs chore has no test exercising Markdown -> verify stamps FAIL -> the chore dead-ends before memory-flush/commit.

## Desired State

- (reporter) The recommender emits a valid reporter so fresh vitest installs get a working test.cmd.
- (verify trap) A pure-docs chore is not gated on an inapplicable behavior suite. verify is excepted (recorded by /triage) when the write_set is pure-docs/prose ONLY AND test.cmd is a behavior suite. Any code/config/script touch -> the gate still applies.

## Non Goals

- Do NOT change the verify/integrate verdict PASS rule (exit 0 AND >=1 test executed AND nothing failed) — only change WHEN verify runs in the chore track.
- Do NOT touch verify behavior in other tracks (tdd / spec-entry / freeform / epic) — scope the conditionality to the chore track only.
- Do NOT change the shipped default test.cmd (the audit) in project.json templates — only fix the recommender stale reporter flag.
- Do NOT auto-classify behavior-suite vs structural-check heuristically — rely on /triage recording the explicit exception.

## Solution Leakage

- Request proposed `--reporter=dot` (validate exact reporter choice in spec).
- Request proposed making verify conditional the way integrate already is (validate the mechanism in spec).
- Request proposed /triage records the exception (validate the exception-recording path in spec).
