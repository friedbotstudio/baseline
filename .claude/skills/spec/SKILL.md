---
name: spec
owner: baseline
description: Draft a Workflow Phase 4 technical spec from an intake (and optionally a BRD + scout + research memo). The spec defines how the system will change: design (C4 + UML + dependency graph in PlantUML), data, APIs, tests, rollout, rollback. Output lives at `docs/specs/<slug>.md`. Never self-approves — approval happens via `/approve-spec`.
---

# Spec — Workflow Phase 4

You are drafting a **technical spec**. The spec answers "how" — what changes, in which files, behind which flags, with which tests and rollout. It is the document a different engineer can pick up tomorrow and build from.

The spec is **diagram-driven**: C4 + UML + a dependency graph in PlantUML, tables for contracts and traceability, prose only for what a diagram cannot say. Three hooks enforce this at the Write boundary:

- `artifact_template_guard` — required `##` headings present.
- `spec_diagram_presence_guard` — required diagram kinds present inside ```plantuml``` fences.
- `plantuml_syntax_guard` — every ```plantuml``` fence parses.

## Prerequisite

Per `.claude/state/workflow.json`, `research` must be in `completed` OR in `exceptions` (quickfixes and some bugfixes skip research). The `track_guard` hook enforces this at Write time, but verify upfront so you can stop with a clear message rather than hitting the guard.

## Inputs

- **Required**: the intake at `docs/intake/<slug>.md` (or the bugfix description if entry was `/triage` → `spec`).
- **Optional**: BRD at `docs/brd/<slug>.md`, scout report at `docs/scout/<slug>.md`, research memo at `docs/research/<slug>.md`.
- `template.md` in this skill directory — the canonical structure.

## Steps

0.5 **Brainstorm gate (Step 0.5 per CLAUDE.md Article X.3).** Read `.claude/state/workflow.json` and apply read-time defaults via `.claude/skills/brainstorm/workflow-defaults.mjs → withDefaults`. If `skip_brainstorm` is `false` (or absent — defaults to `false`) AND `track_id` is `spec-entry`, invoke `Skill(brainstorm, {request, slug, calling_phase: "spec"})` before reading inputs. On intake-full tracks the brainstorm gate already fired at `/intake` Step 1.5; the brief at `docs/brief/<slug>.md` is already present and `/spec` reads it as an additional input. If `skip_brainstorm` is true, skip this gate and proceed.

1. Read all available upstream artifacts (intake, brd, scout, research, and the brainstorm brief when present). Note the acceptance-criterion IDs from the intake/BRD — the spec's AC table must either reuse those IDs or trace to them explicitly.
1.5 **Codesign mode (Step 1.5 per CLAUDE.md Article X.4).** Read `workflow.json → codesign_mode` (with `workflow-defaults.mjs` applied — default `false`). If `codesign_mode` is `false`, skip Step 1.5 entirely and proceed to Step 2 — the codesign-off path is byte-equivalent to the pre-feature `/spec` so opting out restores prior behavior. If `codesign_mode` is `true`: (a) identify load-bearing technical decision points via `.claude/skills/spec/decision-finder.mjs → findDecisionPoints({researchMemo, scoutReport})`; (b) for each decision, present Claude's recommended option + rationale + `AskUserQuestion` (Approve / Suggest alternative / Discuss tradeoff); (c) when the engineer suggests an alternative, capture verbatim rationale via a free-form turn and persist to `.claude/state/codesign/<slug>.json` via `.claude/skills/spec/codesign-state.mjs`; (d) render the `## Decisions` section into the spec via `.claude/skills/spec/decisions-writer.mjs → writeDecisionsSection(decisions)`. Engineer verbatim becomes canonical — the chosen option recorded is the engineer's pick when they override, not Claude's recommendation. The `## Decisions` section appears near the top of the spec, before the existing `## Design` section.
1.6 **Epic sliced-spec mode (track_id `epic`, seed.md §18.9).** When `workflow.json → track_id` is `epic`, read `.claude/state/epic/<slug>.json → slices[]`. The spec SHALL carry one `## Slice <id>` section per slice (heading anchor `slice-<id>`, matching the `#slice-<id>` fragment children pin), and each AC in the spec's AC table SHALL be assigned to exactly one slice (group the `## Slice <id>` section's ACs to match that slice's `acs`). A slice section names the slice's behavior, its ACs, and its write surface — it is the contract an `epic-child` reads in isolation, so it must stand on its own without the reader needing sibling slices. The single `/approve-spec` covers every slice; never split approval per slice. On non-epic tracks, skip this step (no slice sections).
2. Read `template.md`. Every `##` heading must appear in the output; every required diagram kind (C4 Context/Container/Component, class, sequence, dependency graph) must appear inside a ```plantuml``` fence.
3. Draft each diagram **first**, then the surrounding table/prose. If you cannot draw a diagram, you do not understand that part of the design yet — record it under **Open questions** rather than faking prose.
4. Confirm every third-party API cited (in the Libraries table, Contracts rows, or diagram labels) via the `context7` MCP. Record the library version. Never recall an API from training data.
5. Verify each `AC-NNN` row points to a real `§Behavior #N` anchor, and that the corresponding sequence diagram actually defines the promised behaviour.
6. Run `/spec-lint <slug>` before saving if you want to preview what the guards will report — same checks, not enforced.
7. Write to `docs/specs/<slug>.md`.
8. **NEVER write `Status: Approved`, `Approved: true`, or any variation.** The `spec_approval_guard` blocks self-approval. Approval is the token written by `/approve-spec` to `.claude/state/spec_approvals/<slug>.approval`.
9. Append `"spec"` to `.claude/state/workflow.json` → `completed`.
10. Tell the user: "Spec drafted at `docs/specs/<slug>.md`. Render diagrams with `/spec-render <slug>`, review, then `/approve-spec <slug>` (or pass the full path). After approval, `/tdd`."

## Diagram rules (non-negotiable)

- **Renderable PlantUML only.** Every fence must validate — broken diagrams are worse than missing ones because they waste reviewer time. Test locally with `plantuml -checkonly -pipe` or the `plantuml` MCP server.
- **C4 uses the stdlib includes**: `!include <C4/C4_Context>`, `!include <C4/C4_Container>`, `!include <C4/C4_Component>`. No remote URL includes — they break offline review.
- **One sequence per AC.** The sequence *is* the contract; prose descriptions of behaviour are forbidden. If an AC spans multiple interactions, use `==` dividers inside one sequence diagram rather than splitting into two.
- **Dependency graph is directed and acyclic.** `A --> B` means "A depends on B". Cycles mean the design has a deadlock risk — surface under Open questions, don't draw the cycle.
- **Class diagram mirrors the migration DDL.** Every `<<new>>` / `<<changed>>` field must have a matching `ALTER` in the DDL block. If the DDL changes, update the class diagram in the same edit.

## Drafting rules (from seed.md § Code Standards)

- **No stubs — EVER.** If the spec declares a function or endpoint, define its contract fully: inputs, outputs, errors, idempotency, side effects, ownership. If you can't, do not declare it — flag it as an Open question.
- **YAGNI.** The spec describes what is built now. A "future option" with no current test driving it does not belong here.
- **Context7 for every library API.** API shape confirmed via the `context7` MCP, not training recall. Record the library version.
- **Acceptance criteria are testable.** Numbered, concrete, traced. "Users can retry" is not an AC; "on 5xx from upstream, worker retries with 100/200/400 ms backoff, max 3 tries, then dead-letters" is.
- **Rollout and rollback are named, not 'standard.'** Which flag? Which kill-switch? Which metric + threshold + window detects a bad rollout within 5 minutes?

## Archive planning

The spec template includes an **Archive plan** section. Its purpose is to *document at drafting time* which artifacts ship together when this work lands. For 90% of specs the default bundle (every file named `<slug>.*` in the workflow directories) is exactly right — leave the "Extras" list as *(none)*. Only populate it if this work produces a one-off file that isn't slug-named but belongs with the bundle (e.g., a migration script kept for reference, a runbook).

The `archive` skill (Phase 10.5) reads the slug convention automatically; the human-authored "Extras" list is an advisory — surface it to the reviewer so the bundle is transparent before approval.

## Common failure modes (don't)

- Restating the intake verbatim — the spec earns its keep by adding design, not by re-narrating requirements.
- Writing behavior as prose ("we'll retry on 5xx") — draw the sequence.
- A `C4_Container` diagram that invents containers not in any code path — if it isn't deployable today, it belongs in a future-work spec.
- An AC row whose `§Behavior #N` anchor resolves to an empty section.
- Hiding open questions in body prose — surface them under **Open questions** so the reviewer (and `/approve-spec` gate) sees them.
- Pre-optimizing — if profiling hasn't run, a performance plan is speculation.
