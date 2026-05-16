# Codebase Scout Report — design-ui-mixed-brief

Mapping for Q-007: amend `design-ui` Stage 0 misroute path to return `final_state: "mixed_brief"` with a `lane_split` array when the brief spans design + development + copy. The current behavior returns single-lane `not_a_design_task` or interactively asks the user to disambiguate. Architecture preserved: design-ui stays single-lane; never executes development/copy.

## Primary touchpoints

### The skill itself (`.claude/skills/design-ui/`)

- `SKILL.md:20` — Stage 0 commitment: "A misrouted task_brief (development or copy concern) returns immediately with `final_state: "not_a_design_task"` and a pointer to the correct lane." Must be amended to name two misroute states.
- `SKILL.md:44-61` — Stage 0 stage definition. Current misroute return shape at lines 52-59 (`final_state: "not_a_design_task"`, `correct_lane`, `reason`, `state_file`). The new `mixed_brief` branch is added alongside, not replacing.
- `SKILL.md:120` — Stage 4 Report shape: `"final_state": "complete" | "needs_human" | "blocked" | "not_a_design_task"`. Needs `mixed_brief` added as a fifth value and a `lane_split` field defined in the same Report block.
- `references/design-vs-development.md:23-24` — Step 2(d) of the per-concern rule: "Mixed → return to step 1 with the user surfaced; ask which concern they mean." This is the **interactive** behavior that the amendment replaces with a structured return.
- `references/design-vs-development.md:70-81` — Misroute handling block; replicates the SKILL.md return shape. Needs the `mixed_brief` branch added.
- `references/design-vs-development.md:83-89` — "When in doubt" section currently surfaces a one-line question. After the amendment, this becomes the structured `lane_split` decomposition.
- `references/intent-table.md:50` — Surface-less default: "Otherwise return `not_a_design_task` with a request for clarification." Unaffected; surface-less ≠ mixed-lane.
- `references/orchestration.md:114-121` — Caller-policy table. Needs a new row for `mixed_brief` declaring caller behavior (likely: fan out per `lane_split` rows, route each to the named lane, do not block).
- `references/state-machine.md:24` — Canonical `state` enum. Add `mixed_brief`.
- `references/state-machine.md:80-88` — Terminal-state table. Add row for `mixed_brief` with caller action.
- `references/state-machine.md:101` — Resume-logic for "Present and state is `not_a_design_task` → sticky". `mixed_brief` should mirror this stickiness.

### Constitutional binding (`CLAUDE.md`)

- `CLAUDE.md:264` — Article X.2 row: "design-ui SHALL classify incoming intents at Stage 0 (design / development / copy). A misrouted intent returns `final_state: "not_a_design_task"` with a pointer to the correct lane and writes no code." The wording references the single-value return; needs amendment to allow `mixed_brief` as a second misroute state. Spec phase must propose the exact replacement wording.
- `docs/init/seed.md` — Per CLAUDE.md Article I.4 (precedence: seed.md > CLAUDE.md > implementation), if Article X.2 changes non-trivially, seed.md may need a matching note. Spec phase to spot-check §15 (Article X.2 source text) for drift.

## Entry points that reach this code

### Workflow-phase callers

- `.claude/skills/tdd/SKILL.md:79` — `/tdd` coordinator seeds Tasks D₁..D_N (`"Run /design-ui for <row.slug>"`) — one per `## Design calls` row. The harness invokes `Skill(design-ui)` per row at its own tick. **The /tdd skill itself does NOT inspect `final_state`** — that read happens at the harness's `design-ui-tick` execution per the caller-policy table in `references/orchestration.md`.
- `.claude/skills/spec/template.md:211` — Spec contract: "When this spec's write_set intersects `project.json → tdd.ui_globs`, every UI surface needs a design call here. `/tdd` Step 6 reads each row, serializes it to a `task_brief`, and invokes `Skill(design-ui, task_brief)` once per row." Sender contract; unaffected by return-shape changes.

### Spec-level downstream consumers

- `docs/specs/release-workflow.md:504` — Shipped spec naming `not_a_design_task` in illustrative prose. Not hook-enforced; the new `mixed_brief` state does not retroactively invalidate this text (single-lane misroutes still return `not_a_design_task`).

### Hooks

- `.claude/hooks/spec_design_calls_guard.sh` — PreToolUse(Write|Edit|MultiEdit) hook enforcing the spec's `## Design calls` section presence when write_set intersects `tdd.ui_globs`. Inspects spec markdown only; does NOT inspect design-ui's return shape. **No interaction with `mixed_brief`.**

### Not currently wired

- `.claude/skills/document/SKILL.md`, `.claude/skills/chore/SKILL.md` — No `design-ui` invocation references. The design-ui SKILL.md's claim (lines 151-152) that `/document` and `/chore` route through design-ui is forward-looking, not yet implemented in those skills.

## Existing tests

- `tests/design-ui-classification.test.mjs` (6 tests, currently passing) — Asserts Stage 0 documentation, classification rules present in `design-vs-development.md`, intent-table row count, recipe-content invariants, and `task_brief` schema. **Line 39 asserts `not_a_design_task` literal appears in SKILL.md**; that still holds post-amendment. A new assertion for `mixed_brief` is required.
- `tests/design-ui-orchestration.test.mjs` (5 tests, currently passing) — Asserts the 3-iteration cap, P0 blocking, state-machine `state` field shape, resume logic, and terminal-state enumeration. **Line 67 loops `['complete', 'needs_human', 'blocked', 'not_a_design_task']`** — needs `mixed_brief` added.
- `tests/tdd-step-6.test.mjs` — References `/design-ui` from /tdd Step 6's perspective only. No assertions on design-ui's return shape; **unaffected.**

No tests under `.claude/hooks/tests/` or `.claude/skills/*/tests/` reference design-ui.

## Constraints and co-changes

- **CLAUDE.md Article X.2** is the constitutional commitment. Its Stage-0-misroute row binds the current single-value return. The spec phase must propose the exact updated wording — the amendment introduces a second misroute state without removing the first.
- **State-file enum**: `state-machine.md:24` declares canonical `state` values. Adding `mixed_brief` requires synchronized updates at three places in `state-machine.md` (enum line, terminal-state table, resume-logic block) AND in `SKILL.md` Stage 4's Report shape.
- **Memory entry Q-007** at `.claude/memory/pending-questions.md:84-93` is the work's source; it gets closed in the document phase with a closing block citing the new state name.
- **Vendored `impeccable` skill** (Article IX, untouchable) is unaffected — Stage 0's misroute decision precedes any `impeccable` invocation. The amendment stays entirely inside design-ui's surface.
- **Archived original spec** at `docs/archive/2026-05-12/design-ui-orchestrator/` is the constitutional source for design-ui's commitments. Cite it at spec time for traceability; do not edit it.

## Patterns in use here

- **Three-place synchronization for terminal states.** A new `final_state` value requires coordinated updates in: (1) `SKILL.md` Stage 4 Report shape; (2) the per-stage prose for the introducing branch; (3) `references/state-machine.md` enum + terminal-state table. Existing tests assert this alignment by enumeration (`design-ui-orchestration.test.mjs:67`).
- **Caller policy lives in one place.** `references/orchestration.md`'s caller-policy table (line 114-121) is the canonical contract for what each `final_state` means to callers. A new state requires a new row there — no other file documents caller-side handling.
- **Misroute returns write a checkpoint state file.** `SKILL.md:61`: "design-ui still writes a checkpoint state file even on misroute — the orchestration history is traceable." Same applies to `mixed_brief`. Resume logic at `state-machine.md:101` for `not_a_design_task` is sticky-on-slug; `mixed_brief` should mirror this.
- **Markdown-driven contract.** design-ui has no executable runtime; its behavior is the prose contract in SKILL.md + references/. Tests assert documentation, not runtime behavior. Implementation = editing prose to instruct Claude (the executor); no code is generated.

## Risks / landmines

- **CLAUDE.md row drift.** Article X.2's Stage-0 row is text-bound to the current single-value return. Audit-baseline (`.claude/skills/audit-baseline/audit.sh`) checks for constitutional citations; the amendment must update the row without breaking the citation pattern. Spec phase to specify exact wording.
- **Sticky-on-resume needs mirroring.** State-machine.md line 101 makes `not_a_design_task` sticky for the same slug — re-invocation returns the cached Report. `mixed_brief` should be sticky too (re-classifying a mixed brief shouldn't change the lane_split arbitrarily on re-invocation), but the spec must say so explicitly. Otherwise resume behavior diverges from the existing pattern.
- **Live shipped specs name the current state.** `docs/specs/release-workflow.md:504` and `docs/specs/release-workflow.md:499` cite `not_a_design_task` in prose. The amendment does not invalidate this — single-lane misroutes still return `not_a_design_task` — but the spec phase must commit to this backwards-compatibility in writing.
- **No live downstream consumer fans out today.** `/tdd` Step 6 / harness's `design-ui-tick` does not currently inspect `final_state` and act per `references/orchestration.md`. The new `mixed_brief` row in that table sets a precedent: someone (the spec, then the implementation) must define the caller action concretely. Likely: stop the design-ui-tick, surface the lane_split, ask the spec author to either split the `## Design calls` row or proceed with the design portion only. **The spec phase should commit to one choice.**
- **`design-vs-development.md` mixed-case prose duplicates the SKILL.md misroute prose.** Currently both files independently describe the misroute behavior. The spec should specify which is the canonical source and which mirrors — drift between the two is a recurring class of bug.
- **Test enumeration is whitelist-based.** `design-ui-orchestration.test.mjs:67` checks each terminal state by literal name. Adding `mixed_brief` to the implementation without updating that line silently passes (extra states aren't flagged); only the explicit test addition flags missing documentation. The TDD scenario step should include a test that fails when `mixed_brief` is absent from state-machine.md.
