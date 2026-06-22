# Brainstorm brief — mvp-sprint-parallel-cycles

## Actor

An engineer driving the baseline to build a multi-feature MVP — the human who waits on the build and judges whether it is complete.

## Trigger

When one deliverable (a website or product MVP) decomposes into many features; today each feature becomes its own full workflow run.

## Current State

Work fragments into ~10 serial full-workflow runs; the human waits hours; the result still ships incomplete in three ways — no record of "done", happy-path-only (skips edge/error/empty states), and pieces built but not wired together end-to-end.

## Desired State

The baseline plans the MVP into a sprint block with a completeness oracle that tracks a done-record + edge coverage + end-to-end wiring, runs the slices as parallel cycles, and makes wall-clock equal to the slowest single slice instead of the sum of all slices.

## Non Goals

(1) Token optimization is explicitly NOT the goal — trade tokens for time. (2) No relaxation of quality bars: real failing-test-first, no stubs, no mocks of internal code, and both human consent gates (approve-spec, grant-commit) stay intact on the parallel path. (3) "Features never started" / scope-drop is NOT the completeness failure mode being targeted.

## Solution Leakage

Captured (not treated as the requirement altitude): epic-level wave/DAG scheduler, git worktrees, parallel epic-children, RALPH yield/stop-rule, Article II amendment, merge-audit, single gate-C. These are the engineer's proposed mechanism; the underlying needs are speed (slowest-slice-bound), completeness (done-record + edges + wiring), and preserved quality bars.
