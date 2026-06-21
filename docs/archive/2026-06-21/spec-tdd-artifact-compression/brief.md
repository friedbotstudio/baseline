# Brainstorm brief — spec-tdd-artifact-compression

## Actor

The baseline harness / Claude generating spec and tdd artifacts during workflow runs. The cost-bearer is the maintainer running baseline-on-baseline pipelines (success metric: cut BOTH token cost and wall-clock, neither prioritized).

## Trigger

Every spec-bearing and tdd-bearing workflow run (spec-entry, intake-full, tdd-quickfix tracks) — specifically the /spec and /tdd generative phases where the persisted hand-off artifacts are authored.

## Current State

Measured on the clean spec-entry bundle (docs/archive/2026-06-21/residual-epic-approval-cd-bypass/timing.md): /spec emits ~96,990 output tokens (40% of run output), /tdd ~89,163 (37%) — together 77% of all output tokens. Output cost tracks persisted-artifact + narration volume, NOT edits made (cross-checked against the simplify zero-edit anomaly in DATA POINT 2). Source framing: docs/references/token-efficiency.md (η = decision-relevant-info / tokens; spec is both the #1 sink AND the inter-phase state object = the safe compression target).

## Desired State

The /spec and /tdd phases cost measurably fewer output tokens AND less wall-clock per run, while every downstream consumer (spec_diagram_presence_guard, spec_design_calls_guard, artifact_template_guard, spec-diagram-review, spec-traceability-review, and the harness) still passes and load-bearing diagrams stay intact. IN-SCOPE STRETCH: trim model narration/verbosity during spec+tdd generation, carefully and behind its own acceptance criteria + guardrails (the token-efficiency reference flags live-reasoning compression as the alias-drift-risk axis, so it is gated, not blanket).

## Non Goals

- Do NOT change /integrate's serial full-suite run — it is a deliberate determinism trade-off (the live-objtemplate-rebuild-races landmine).
- Do NOT blanket-remove diagrams — load-bearing diagrams (genuine C4/sequence/class dependencies) stay; any gating is by write_set relevance, not removal.
- ZERO regression in downstream guard/review enforcement — what the 3 guards + 2 spec-reviews + harness enforce is the hard fidelity floor.
- NOT a non-goal (explicit): live in-phase reasoning trimming — the maintainer placed it IN scope as a stretch (see Desired state).

## Solution Leakage

Request is heavily solution-shaped: 'compress artifacts', 'gate diagram/verbosity by write_set', 'minimal decision-relevant invariant set'. Underlying need (probed): cut output-token cost AND latency on the two generative phases without losing fidelity downstream phases depend on. The write_set-gating mechanism is a CANDIDATE, not a commitment — /research surfaces alternatives and /spec decides.
