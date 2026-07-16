# Cross-track velocity lever ranking (D2)

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Primary input: docs/brief/velocity-lever-ranking.md (brainstorm brief).
-->

## Problem

Baseline-on-baseline development is slow — the original complaint (`-v0lv`, 2026-06-21): "one feature takes ~1-3 hours; we need ~20 minutes for a ~2-hour run." Since then, velocity **levers 0/1/2/4/4b have landed** (per-phase timing + token instrumentation, parallel checker fan-out, the right-size gate, artifact/verdict compression, reverify-skip) and **eight timing/token data points (DP1–DP8)** have accrued across track-types. But that data was never synthesized into a single ranked strategy: the maintainer has no track-type-aware answer to "for this kind of run, which lever actually moves the needle, and what — if anything — is worth building next." The `-v0lv` umbrella stays open on exactly this: the cross-track ranking + the next-lever decision.

The data already points to non-obvious conclusions that a ranking must make explicit:
- Runs are **model/reasoning-bound, not human-wait-bound** for quickfixes (DP1: ~96% model / ~4% human-wait), but **decision-latency-bound** for intake-full-with-findings (DP3) — track-type flips the ranking.
- The **"scenario-output mirage"** (DP6 diagnosis): per-phase output tokens measure *reasoning volume*, not artifact size — so terser-artifact levers have a low ceiling and the token axis cannot identify Lever-4 targets.

## Goal

Produce a durable, track-type-aware ranked velocity strategy from the accumulated data (DP1–DP8) — which lever matters most for which run-type, which have landed, which remain, and which remaining lever is cheaply buildable — and, at spec time, decide whether this workflow also lands the top-ranked buildable lever or stays analysis-only.

## Non-goals

- **Not re-litigating whether to make baseline faster** — that need is settled; this is synthesis of existing data, not a fresh investigation.
- **Not building Lever 3 (model/effort tiering)** — flagged architecturally constrained by Article II (main-context phases run at the fixed session model; a phase cannot be cheaply tiered down without becoming a subagent).
- **Not pursuing the scenario-output terser-artifact lever** — the "scenario-output mirage" showed it is a mirage with a low ceiling.
- **Not pre-committing to a code change now** — the build/no-build call is explicitly deferred to `/spec`, made with the ranking evidence in hand (engineer decision at brainstorm).

## Success metrics

- Cross-track ranking coverage — baseline: 0 track-types ranked, target: ≥ 2 (quickfix + at least one spec-track sample), measured via: the ranking artifact citing ≥ 1 clean data point per track-type it ranks.
- Next-lever decision — baseline: undecided (umbrella open), target: a recorded decision (build a named lever, or defer with a named reason), measured via: the `decisions.md` entry + `-v0lv` umbrella update.
- Data-honesty caveats stated — baseline: implicit, target: explicit, measured via: the ranking naming its measurement gaps (AskUserQuestion-wait invisibility per DP5; the reasoning-not-artifact token axis per DP6).

## Stakeholders

- **Requester**: razieldecarte (baseline project owner — bears the per-feature velocity cost)
- **Reviewer**: razieldecarte (approves the ranking direction at gate A; makes the build/no-build call at spec)
- **Operator**: the Claude Code harness (the ranking's conclusions steer how future workflows spend model-time)

## Constraints

- **Evidence must be the accumulated data**, not fresh intuition — the ranking derives from DP1–DP8 in the `-v0lv` backlog entry (and any `timing.md` in the archive bundles), citing specific data points.
- **Measurement honesty**: the ranking SHALL state its data gaps — (a) `AskUserQuestion` waits (brainstorm/codesign/triage) are invisible to the timing instrumentation, so brainstorm-heavy runs understate human-wait (DP5 caveat); (b) the per-phase output-token axis measures reasoning volume, not artifact byte-size (DP6 "mirage"), so it cannot by itself identify artifact-compression targets.
- **Sample thinness**: most data points are one track-type (quickfix); the ranking must flag where a conclusion rests on a single sample and is provisional.
- **If a build is chosen at spec**: it must not touch consent-flow or constitutional surface without the corresponding governance amendment (the rebuild-tax lever, if built, edits shipped baseline files → manifest regen).

## Acceptance criteria

1. Given the accumulated data, when the ranking is produced, then it ranks the velocity levers **per track-type** (at minimum: quickfix = model/reasoning-bound; a spec-track type = decision-latency-bound), each ranking citing ≥ 1 specific data point (DP1–DP8).
2. Given the landed levers (0/1/2/4/4b), when the ranking is produced, then it records their status (landed / partial / open) and does not re-propose a landed lever as "next."
3. Given Lever 3 (model-tiering) and the scenario-output lever, when the ranking is produced, then each is explicitly marked out-of-scope with its stated reason (Article II constraint; mirage), not silently dropped.
4. Given the remaining candidate levers (rebuild-tax and any others surfaced), when the ranking is produced, then exactly one is named the top cheaply-buildable remaining lever, or the ranking states that none is worth building now with a reason.
5. Given the ranking, when `/spec` runs, then the spec records an explicit build-vs-analysis-only decision (owner: engineer) — either committing to implement the named lever (with ACs + tests) or declaring the workflow analysis-only.
6. Given the ranking artifact, when it is reviewed, then it states its measurement caveats (AskUserQuestion-wait invisibility; reasoning-not-artifact token axis) so no conclusion over-trusts the instrumentation.

## Open questions

- **Build vs analysis-only (deferred to `/spec`, engineer-owned).** Given the produced ranking, does this workflow also land the top-ranked buildable lever (code + tests), or stay a decision/analysis artifact? Settled at spec with the ranking evidence in hand.
- **Rebuild-tax lever shape (only if build is chosen).** If the ranking picks the rebuild-tax lever, what is its concrete mechanism (batch the manifest regen across a workflow's edits? defer re-verify until a phase boundary?) — a `/research` + `/spec` question, not resolved at intake.
