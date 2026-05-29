# Add paired collaborative-drafting modes: brainstorm helper (PM mode) and /spec codesign mode (Engineer mode)

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The current `/intake` skill opens `template.md` and walks the sections sequentially: Problem → Goal → Constraints → Acceptance criteria → Non-goals → Stakeholders. It can ask targeted per-section questions (Step 3 of `intake/SKILL.md`), but the section ordering forces it to commit to a problem shape derived from the raw user statement before anyone explores whether that shape is right. The consequence: when a user says "make X faster", the intake doc lands with Problem="X is slow", Goal="Make X faster", AC="X is faster" — without surfacing what triggered the perception of slowness, which actor is actually affected, or whether the framing itself is correct.

The same gap appears at `/spec` and `/tdd` entry points (workflows where `/triage` skips intake): the skill jumps straight to drafting without a dedicated upstream phase that probes the underlying need.

Separately, for complex-domain problems — computer vision, novel algorithm design, distributed consensus, numerical methods, cryptographic primitives, kernel scheduling — `/spec` today drafts the technical approach unilaterally from `/research` candidates. The engineer's domain expertise is consulted only at `/approve-spec`, by which point the load-bearing technical decisions are already locked into the diagram + AC structure. The dialogue where the engineer would say "actually, use approach Y because Z" never happens; the engineer either approves what Claude wrote or restarts the spec.

## Goal

Entry-phase requirements are captured through a Socratic dialogue (PM mode) that surfaces actor, trigger, and underlying need before any solution shape is committed; complex-domain technical decisions inside `/spec` are made collaboratively (Engineer mode) with Claude proposing approaches and rationale and the engineer approving or overriding with verbatim rationale that becomes canonical.

## Non-goals

- Replacing `/approve-spec` as the human approval gate (codesign mode supplements; the spec still goes through the existing approval token mechanism).
- Adding a separate codesign artifact (codesign is unified into `docs/specs/<slug>.md` per the architectural decision in conversation; the spec gains a `## Decisions` section, no new file).
- Mandating brainstorm or codesign on every workflow (both modes have explicit opt-out / opt-in flags in `workflow.json`).
- Firing brainstorm on `chore` or `freeform` tracks (those skip `/intake`, `/spec`, `/tdd` entry by design; the helper has no entry point there).
- Routing the dialogue through a subagent (CLAUDE.md Article II: decisions live in main context).
- Generating template prose without user dialogue when the brainstorm fires (the entire point is to replace template-driven asking with conversation-driven capture).

## Success metrics

- **First-pass spec acceptance rate.** Fraction of `/spec` artifacts that the user approves without iteration. Baseline: not measured today; track over the next ten workflows post-ship. Target: ≥70% on first pass when brainstorm fires.
- **Mid-workflow scope changes.** Count of `/integrate` failures classified as "needs spec change" (Article V exit). Baseline: not measured today; track over the next ten workflows. Target: directional reduction.
- **Codesign engagement on complex-domain workflows.** Fraction of workflows where the user opts into `codesign_mode: true` AND the resulting spec's `## Decisions` section contains ≥1 engineer-overridden decision. Target: codesign-mode workflows produce engineer-verbatim rationale ≥50% of the time (validates the mode is doing useful work, not rubber-stamping Claude's recommendation).

## Stakeholders

- **Requester**: razieldecarte@gmail.com (project owner; identified this gap during the swarm-redesign conversation when intake's pattern emerged as "PM mode")
- **Reviewer**: razieldecarte@gmail.com (solo project; same person approves the spec via `/approve-spec`)
- **Operator** (who runs it in prod): razieldecarte@gmail.com and any downstream user who installs the baseline via `npx @friedbotstudio/create-baseline`

## Constraints

- **Article II (architectural principle).** Brainstorm and codesign dialogues run in main context. Neither may delegate to a subagent. The `swarm-worker` is the only sanctioned subagent and is out of scope here.
- **Article IV (workflow ordering).** Brainstorm inserts as Step 0.5 inside the entry skill (no new phase row in the canonical 11-phase table). Codesign is an internal mode of `/spec` Phase 4 (no new phase row).
- **Article X.1 (copy register).** `docs/brief/<slug>.md` is internal governance, scoped OUT of the impeccable em-dash bans; `template.md` for the brief may use the constitutional voice.
- **Backward compatibility with in-flight workflows.** `workflow.json` files written before this feature ships do not carry `skip_brainstorm` or `codesign_mode`. Both fields default to `false` when absent (brainstorm fires by default; codesign off by default). No migrator needed.
- **`audit-baseline` count.** Shipping `brainstorm` raises the skill count from 39 to 40. The audit must be updated in the same diff that ships the skill, or the audit will fail on first run.
- **`spec-shippability-review` applies.** Brainstorm is baseline-shipped (`owner: baseline`); its SKILL.md must not reference `src/` / `tests/` / `scripts/` paths as runtime invocations.
- **Manifest auto-pickup.** `scripts/build-manifest.mjs` reads `owner: baseline` frontmatter; no code change needed there. Shipped manifest at `obj/template/.claude/manifest.json` regenerates automatically.
- **`/archive` bundle extension.** `docs/brief/<slug>.md` must be moved to the archive bundle alongside intake/scout/research/spec/security; archive skill needs the new path.
- **No new hooks.** This feature relies on the existing `/approve-spec` gate (Engineer mode emits its rationale into the spec, which goes through the existing approval flow). No new PreToolUse / SessionStart / Stop hooks are introduced.

## Acceptance criteria

1. Given a new workflow created via `/triage` with `track_id` in {`intake-full`, `spec-entry`, `tdd-quickfix`} AND `workflow.json → skip_brainstorm` is `false` or absent, when the entry phase skill (`/intake`, `/spec`, or `/tdd`) is invoked, then the skill SHALL invoke `Skill(brainstorm)` as Step 0.5 before opening its `template.md`.
2. Given `workflow.json → skip_brainstorm: true`, when the entry phase skill is invoked, then `Skill(brainstorm)` SHALL NOT be invoked and the skill SHALL proceed directly to its existing drafting flow with no behavior change relative to the pre-feature baseline.
3. Given the brainstorm skill is running Stage 1 (probe), when any model-generated dialogue turn is produced, then the turn SHALL NOT contain a proposed solution, technical recommendation, library name, or implementation verb (`add`, `use`, `implement`, `refactor to`); a test SHALL assert this by scanning a recorded dialogue transcript for solution-shaped tokens and failing on hit.
4. Given a brainstorm dialogue that the user has confirmed via Stage 3 (`AskUserQuestion → Yes, capture it`), when the brainstorm skill exits, then `docs/brief/<slug>.md` SHALL exist with these fields populated from the dialogue: actor, trigger, current state, desired state, non-goals, solution-leakage detections.
5. Given `workflow.json → codesign_mode: true` and `/spec` is invoked, when `/spec` begins drafting, then `/spec` SHALL identify ≥ 1 load-bearing technical decision point AND present a proposal + rationale + `AskUserQuestion` per decision point before drafting C4 / sequence / write_set sections.
6. Given codesign mode is active AND the user selects "Suggest alternative" for any decision point, when `/spec` writes `docs/specs/<slug>.md`, then the spec SHALL contain a `## Decisions` section AND the engineer's verbatim rationale SHALL be present as a blockquote in that section AND the chosen option recorded SHALL be the engineer's, not Claude's recommendation.
7. Given `/integrate` fails with "spec change needed" classification per Article V AND the original workflow ran in `codesign_mode: true`, when the user re-invokes `/harness` to resume, then `/spec` SHALL re-enter codesign mode AND surface the integrate-failure context AND `AskUserQuestion` whether to revisit the relevant `## Decisions` entry. Re-entry SHALL cap at 3 revisits per decision point before terminating with `final_state: "needs_human"`.
8. Given a workflow already in flight before this feature ships (workflow.json lacks `skip_brainstorm` and `codesign_mode` fields), when any entry skill reads `workflow.json`, then both fields SHALL default to `false` without erroring AND the workflow SHALL proceed with brainstorm firing (skip_brainstorm: false default) and codesign off (codesign_mode: false default).
9. Given the new `brainstorm` skill ships in `.claude/skills/brainstorm/` with `owner: baseline` frontmatter, when `audit-baseline` runs, then the audit SHALL report skill count = 40 (was 39) AND `manifest.owners.skills` SHALL include `"brainstorm": "baseline"` AND the audit SHALL exit 0.
10. Given `/triage` parses `--no-brainstorm` or `--codesign` in the request string, when `/triage` writes `workflow.json`, then `skip_brainstorm: true` or `codesign_mode: true` SHALL be set respectively in the written JSON.
11. Given `/archive` runs at Phase 10.5 AND `docs/brief/<slug>.md` exists, when archive bundles the workflow artifacts to `docs/archive/<date>/<slug>/`, then `brief.md` SHALL be present in the bundle alongside `intake.md`, `scout.md`, `research.md`, `spec.md`.

## Open questions

- Does the brainstorm dialogue protocol reuse `design-ui` Stage 0's intent classification pattern, or build a fresh Socratic protocol? `/research` should answer.
- What exact heuristic markers does `/triage` use for "request is already well-specified" auto-detection of `skip_brainstorm: true` (proposed direction: presence of actor + trigger + desired-state in a single sentence; needs verification against real triage prompts)?
- What exact heuristic markers does `/triage` use for complex-domain auto-suggestion of `codesign_mode: true` (proposed: keyword list `computer vision`, `model architecture`, `numerical`, `cryptographic`, `consensus`, `realtime`, `kernel`; needs validation)?
- Should `/research` auto-flag `codesign_recommended: true` in its memo when no candidate dominates on tradeoffs? If yes, where does the flag live and how does the user accept it?
- When `/intake` is re-invoked on an existing workflow (`workflow.json → completed` already contains "intake"), should brainstorm re-fire or read the existing `docs/brief/<slug>.md`? Default behavior?
- The codesign decision-point cap of 3 revisits is documented as a constant — does it live in `project.json` as a tunable, or hardcoded in `/spec`?
- Does the codesign `## Decisions` section need its own write-boundary guard (parallel to `spec_design_calls_guard`), or is the spec_diagram_review skill sufficient to verify completeness?
