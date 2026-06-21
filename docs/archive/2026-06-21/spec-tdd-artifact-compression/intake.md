# Compress the spec and tdd persisted hand-off artifacts to cut output-token cost and wall-clock without losing downstream fidelity

<!--
Intake document. Produced by the `intake` skill.
Primary input: docs/brief/spec-tdd-artifact-compression.md (brainstorm brief).
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The two generative workflow phases dominate output-token cost. On the cleanest measured spec-entry run (`docs/archive/2026-06-21/residual-epic-approval-cd-bypass/timing.md`), `/spec` emitted ~96,990 output tokens (40% of the run's output) and `/tdd` ~89,163 (37%) — together **77% of all output tokens**. The cost tracks the volume of the persisted hand-off artifact plus narration, **not** the size of the change (cross-checked against DATA POINT 2, where `simplify` cost the most output while making zero edits). Output tokens are priced ~3× input, and the same volume re-inflates downstream phases that re-read the artifact. Every spec-bearing and tdd-bearing run (spec-entry, intake-full, tdd-quickfix tracks) pays this on both axes — dollar cost and wall-clock.

## Goal

The `/spec` and `/tdd` phases cost measurably fewer output tokens and less wall-clock per run, while every downstream consumer of those artifacts still passes.

## Non-goals

- **`/integrate`'s serial full-suite run stays as-is** — its serialization is a deliberate determinism trade-off (the `live-objtemplate-rebuild-races` landmine), not waste to reclaim.
- **No blanket diagram removal** — load-bearing diagrams (genuine C4 / sequence / class dependencies) remain; any reduction is gated by `write_set` relevance, never wholesale.
- **No regression in downstream enforcement** — what the 3 guards + 2 spec-reviews + harness enforce is the hard fidelity floor; this work must not weaken any check.
- *(Explicitly NOT a non-goal)* Live in-phase reasoning/narration trimming is **in scope as a stretch**, behind its own acceptance criteria and guardrails (see Acceptance criteria 6).

## Success metrics

- **spec output tokens** — baseline: 96,990 (residual-cd-bypass run), target: measurable reduction on a comparable run, measured via: `timing.md` token columns.
- **tdd output tokens** — baseline: 89,163, target: measurable reduction, measured via: `timing.md` token columns.
- **spec+tdd wall-clock** — baseline: spec 511s / tdd 740s (same run), target: reduction tracking the token drop, measured via: `timing.md` Model(ms) columns.
- **downstream pass-rate** — baseline: 100% (current guards + reviews green), target: **100% (unchanged)**, measured via: the full `node --test` suite + a representative spec passing all 3 guards and both spec-reviews.

## Stakeholders

- **Requester**: Tushar Srivastava (maintainer; baseline-velocity owner, backlog `-v0lv`).
- **Reviewer**: Tushar Srivastava (solo maintainer — approves the spec at gate A).
- **Operator** (who runs it in prod): the baseline harness itself + CI, on every future spec/tdd-bearing workflow.

## Constraints

- Must not break the downstream artifact consumers: `spec_diagram_presence_guard`, `spec_design_calls_guard`, `artifact_template_guard`, `spec-diagram-review`, `spec-traceability-review`, and the harness phase-reader.
- The `artifact_template_guard` enforces required `##` sections on artifacts — any schema change to the spec/intake templates must keep the guard's required-section contract satisfiable (or update the guard in lockstep, tested).
- Reduction must be gated by `write_set` relevance (the brief's candidate mechanism), not a global verbosity cut.
- Design north star: `docs/references/token-efficiency.md` — compress the inter-phase *state object* (the persisted artifact), preserve the decision-relevant invariant set; over-compression that drops a section a downstream consumer reads is a failure, not a win.
- The change is load-bearing on the harness itself; correctness of the downstream consumers outranks the token saving.

## Acceptance criteria

1. Given a spec/tdd run on a change with a small/non-UI `write_set`, when the artifacts are generated under the new scheme, then `/spec` and `/tdd` output tokens are measurably below the recorded baselines (96,990 / 89,163) — measured via `timing.md` token columns on a comparable run.
2. Given a spec produced under the new scheme, when `spec_diagram_presence_guard`, `spec_design_calls_guard`, `artifact_template_guard`, `spec-diagram-review`, and `spec-traceability-review` run against it, then all pass with zero new failures relative to pre-change behavior.
3. Given a spec whose `write_set` is genuinely load-bearing on diagrams (a real C4 / sequence / class dependency or a `tdd.ui_globs` intersection), when generated, then the required diagram kinds are still present — no blanket removal.
4. Given a `write_set` that does not intersect `tdd.ui_globs` and does not span multiple layers/files, when the spec is generated, then diagram/verbosity is gated down per `write_set` relevance (the artifact carries only the decision-relevant invariant set for that scope).
5. Given `/integrate`, when this work is complete, then its serial full-suite run is byte-for-byte unchanged (no edits to its serialization path).
6. *(Stretch)* Given spec+tdd generation with narration-trimming enabled, when it runs, then the trimming is governed by an explicit, tested guardrail and AC 2's downstream pass-rate stays at 100% (no fidelity loss from trimming live reasoning).

## Open questions

- What exactly is the **minimal decision-relevant invariant set** for each artifact (the spec doc, the tdd state files)? `/research` + `/scout` must enumerate what each downstream consumer actually reads before anything is trimmed.
- How is the per-run token delta measured **across track-types** for AC 1? Only tdd-quickfix and one spec-entry sample exist; a clean before/after comparison needs a defined measurement method (and possibly a fixed reference change to A/B against).
- Can `write_set`-gated section omission coexist with `artifact_template_guard`'s required-`##`-section contract, or must the guard's required-section list itself become `write_set`-aware (and tested)?
- For the stretch (AC 6): what is the structural guardrail that bounds narration-trimming so it cannot cause alias drift — and is it enforceable mechanically, or only advisory?
