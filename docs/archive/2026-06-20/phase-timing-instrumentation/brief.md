# Brainstorm brief — phase-timing-instrumentation

## Actor

The baseline maintainer (repo owner) working to speed up baseline development.

## Trigger

At the end of a workflow run, when deciding which velocity lever to pull next — and generally whenever the maintainer wants to know where a run spent its time.

## Current State

No timing data exists anywhere in the workflow. Run duration ("1-3 hours") is a subjective guess. There is no way to tell whether a run is dominated by model-generation time or by human-wait time at consent gates, so velocity levers cannot be ranked by evidence.

## Desired State

After a run completes, a per-phase breakdown is available in the archive bundle that, for each phase, distinguishes model-generation time from human-wait time (the gaps at consent gates). This makes the dominant bottleneck visible and lets the maintainer rank speedup levers by data rather than guess.

## Non Goals

- Does not change how any phase runs — phase behavior, ordering, and outputs stay identical; this only records when boundaries are crossed.
- Does not act on the data — choosing and applying a speedup lever is separate, later work.
- Does not add a UI or dashboard — a readout inside the archive bundle suffices.
- Cross-run/historical aggregation was offered as a non-goal and deliberately NOT selected — it is left open as a future extension, not excluded; this round delivers a single run breakdown.

## Solution Leakage

- Request arrived solution-shaped: "stamp a durable timestamp at every phase boundary", "persist to disk", "render a duration table at /archive".
- Captured but non-binding on the spec: the underlying need is the per-phase model-time-vs-human-wait split. Where timestamps live, the on-disk format, and where/how the table renders are spec/design decisions made downstream.
