# Per-phase wall-clock timing instrumentation for the workflow (velocity Lever 0)

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Primary input: docs/brief/phase-timing-instrumentation.md (brainstorm brief).
-->

## Problem

A single baseline feature takes roughly 1–3 hours to run through the workflow, and the maintainer wants to cut that to ~20 minutes for a ~2-hour run. But the "1–3 hours" figure is a subjective guess: **no timing data exists anywhere in the workflow**. The pipeline is strictly serial (the harness loops one phase skill at a time) and nothing records when a phase starts or ends.

Concretely, when the maintainer finishes a run and asks "where did the time go?", there is no way to answer. In particular there is no way to tell whether the run was dominated by **model-generation time** (verbose serial artifact generation across many phases) or by **human-wait time** (the run yields at a consent gate and sits idle until the maintainer returns to type `/approve-spec` or `/grant-commit`). Those two bottlenecks demand opposite remedies — parallelize/tier the model work vs. collapse human round-trips — so without the split, the remaining velocity levers cannot be ranked by evidence.

## Goal

Make the time a workflow run spends in each phase measurable — separating machine work from human-wait — so speedup levers are chosen from data instead of guessed.

## Non-goals

- **Does not change how any phase runs.** Phase behavior, ordering, and outputs stay byte-identical; this only records *when* phase boundaries are crossed. Observation, not intervention.
- **Does not act on the measurement.** Choosing and applying a speedup lever is separate, later work driven by what the numbers show.
- **Does not add a UI or dashboard.** A readout inside the archive bundle is sufficient — no web view, live display, or separate reporting surface.
- **Single-run scope.** The deliverable is one run's breakdown. Cross-run / historical aggregation is deliberately *not* excluded (the durable per-run log naturally accumulates), but building aggregation is out of scope for this round.

## Success metrics

- **Coverage** — % of non-excepted phase boundaries in a run that produce a timing record. Baseline: 0%. Target: 100%. Measured via: the on-disk timing log vs. `workflow.json → completed`.
- **Attribution** — model-time and human-wait reported as separate numbers for every phase that crosses a consent gate. Baseline: not reported. Target: both present per gated phase. Measured via: the archive duration table.
- **Zero behavioral footprint** — change to any phase's produced artifacts. Baseline: n/a. Target: 0 diff to phase outputs attributable to instrumentation. Measured via: phase artifacts identical with/without instrumentation.

## Stakeholders

- **Requester**: Tushar Srivastava (repo owner / baseline maintainer, razieldecarte@gmail.com)
- **Reviewer**: Tushar Srivastava (approves the spec at gate A and the commit at gate C)
- **Operator** (who runs it in prod): Tushar Srivastava — the instrumentation runs in-session on every workflow the maintainer executes

## Constraints

- **Observation-only.** Must not alter phase behavior, ordering, or outputs (per non-goal 1).
- **Durable across turns/sessions/yields.** Human-wait at a consent gate spans a yield — the run stops emitting and resumes in a later turn (often a later session) when the maintainer types the gate command. In-memory timing cannot survive that boundary, so timestamps must be persisted to disk at each boundary. The gap between a recorded phase-end and the next recorded phase-start across a yield *is* the human-wait measurement.
- **Tier-2 workflow state.** The timing log lives under `.claude/state/` alongside `workflow.json` / `harness_state` — not a consent path, not guard-blocked. Follow CONSTITUTION §2 state-write discipline (prefer the Write tool / builtin redirects; no `tee`/`sed -i`).
- **Shipped-helper hygiene.** Any new helper script must be `.sh` or `.mjs`/`.js` (Article XI / spec-shippability), not Python, and must be listed in the manifest so consumer installs have it.
- **Baseline self-consistency.** Touching the harness/archive flow means `audit-baseline` and the docs-site count/prose checks must still pass.

## Acceptance criteria

1. Given a workflow run that crosses a non-excepted phase boundary, when the boundary is crossed, then a durable, timestamped record naming the phase and the boundary kind (start / end) is written to disk and survives across turns, sessions, and consent-gate yields.
2. Given a run that yielded at a consent gate and resumed in a later turn, when the duration breakdown is computed, then the wall-clock between the phase-end before the yield and the gate-satisfying resume is attributed as **human-wait**, reported separately from **model-generation** time.
3. Given a completed run that reaches `/archive`, when the archive bundle is produced, then the bundle contains a per-phase duration table with, for each phase, a model-time figure and a human-wait figure (human-wait shown as ~0 / n/a for phases with no gate).
4. Given the instrumentation is active, when any phase runs, then that phase's behavior, ordering, and produced artifacts are unchanged versus a run without instrumentation (observation-only).
5. Given a run where a consent gate was satisfied with negligible delay (instant approval) or a phase that never yields, when the table renders, then human-wait records as approximately zero without error or missing-data crash.

## Open questions

- **Instrumentation point under manual phase invocation.** The harness loop is the natural single chokepoint for stamping boundaries, but phases can also be run manually (a user invoking `/scout`, `/spec`, etc. directly without `/harness`). Does timing need to cover manually-driven runs too, or is harness-driven coverage sufficient for the measurement goal? (Resolution affects where the stamp lives — harness loop vs. each phase skill vs. a guard/hook on the boundary write.) → scout + research to resolve.
- **Clock source & format** (epoch seconds vs ISO-8601, monotonic vs wall) — minor; defer to `/spec`, but note hooks/skills may read the system clock freely (the `Date.now()` ban is Workflow-runtime-only).
