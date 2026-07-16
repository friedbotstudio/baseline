# Brainstorm brief — velocity-lever-ranking

## Actor

The baseline maintainer/developer doing baseline-on-baseline work — the person paying the recurring per-feature velocity cost (~1-3 hours/feature, the original -v0lv complaint).

## Trigger

Every baseline development workflow run. The velocity cost recurs each feature; eight timing/token data points (DP1-DP8) have now accrued across track-types without ever being synthesized into a single ranked strategy.

## Current State

Velocity levers 0/1/2/4/4b have LANDED (measurement, checker fan-out, right-size gate, artifact/verdict compression, reverify-skip), but they were never RANKED across track-types. Eight data points are measured but scattered in the -v0lv backlog umbrella; the cross-track ranking and the "what, if anything, to build next" decision are unmade. The umbrella stays open.

## Desired State

A track-type-aware, ranked velocity strategy produced from DP1-DP8 and recorded as a durable decision (decisions.md + the -v0lv umbrella): for each run-type (quickfix = model/reasoning-bound; intake-full-with-findings = decision-latency-bound), which lever matters most, which have landed, which remain, and which remaining lever is cheaply buildable. The build-vs-no-build call on the top remaining buildable lever is DEFERRED to the /spec phase (engineer decision at brainstorm), to be made with the ranking evidence in hand — so intake/scout/research produce the ranking, and the spec decides whether this workflow also lands a lever or is analysis-only.

## Non Goals

- NOT re-litigating whether to make baseline faster — that need is settled (-v0lv); this is synthesis of existing data, not a fresh investigation.
- NOT building Lever 3 (model/effort tiering) — flagged architecturally constrained by Article II (main-context phases run at the fixed session model; a phase cannot be cheaply tiered down without becoming a subagent).
- NOT pursuing the scenario-output terser-artifact lever — the "scenario-output mirage" finding (DP6 diagnosis) showed per-phase output tokens measure reasoning volume, not artifact size, so that lever is a mirage with a low ceiling.
- NOT pre-committing to a code change now — the build/no-build decision is explicitly deferred to /spec (engineer choice).

## Solution Leakage

The "rebuild-tax lever" (batch the manifest rebuild + re-verify that every baseline-owned edit currently forces) surfaced in DP7 as the leading candidate remaining buildable lever — recorded here as a candidate the ranking will evaluate, NOT a pre-decided build. Per the engineer, whether to implement it (or any lever) in THIS workflow is a /spec-time decision informed by the ranking, not a commitment made now. OPEN QUESTION carried to /spec: given the produced ranking, does this workflow ALSO land the top-ranked buildable lever (code + tests), or is it analysis-only (decision artifact)? Also carried: a measurement caveat the ranking must state — AskUserQuestion waits (brainstorm/codesign/triage) are invisible to the timing instrumentation, so any brainstorm-heavy run understates human-wait (DP5 caveat); the ranking must not over-trust the model-vs-human split for such runs.
