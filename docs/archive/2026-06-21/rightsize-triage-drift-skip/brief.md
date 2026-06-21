# Brainstorm brief — rightsize-triage-drift-skip

## Actor

The baseline maintainer running baseline-on-baseline self-development workflows, with Claude as the harness executor.

## Trigger

(1) A small/low-risk change (e.g. a single-file hook/skill edit) is routed through a full workflow track. (2) The tdd phase drift-check sub-tick runs on a working tree that has not changed since verify passed.

## Current State

Every spec-entry/tdd workflow pays the full reasoning-heavy apparatus regardless of diff size — scenario-design authoring dominates tdd (~71% of tdd on DP6 quickfix), and simplify/security/document all run even on trivial diffs. Separately, the tdd drift-check re-reasons over the branch diff (~26% time / 32% out-tokens on DP5 spec-entry) even when verify already validated the same, unchanged tree.

## Desired State

(1) A change that qualifies as "micro" by a mechanical, deterministic measure (file-count / line-count / write_set-glob thresholds) skips the phases it does not need, cutting wall-clock and token cost. (2) The drift-check is skipped when the working tree is provably byte-identical to the verify-time snapshot, degrading safely to a full re-run on any uncertainty, error, or missing snapshot.

## Non Goals

Not relaxing the integrate serial-suite determinism trade-off (it stays). No LLM-judgment-based skips — every skip decision must be oracle-bound/mechanical. No changes to consent gates. No UI surface.

## Solution Leakage

*(not captured)*
