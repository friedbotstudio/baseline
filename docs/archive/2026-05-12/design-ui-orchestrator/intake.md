# Refactor `design-ui` into a pure `impeccable` orchestrator with structural design-task routing

## Problem

The current `design-ui` skill is a code-writing skill that refuses to act unless the caller has already invoked `impeccable` to fix the aesthetic direction. This makes design-ui's behaviour conditional on prior caller knowledge — the caller has to know which of impeccable's ~20 subcommands maps to their intent, when to invoke each, and how to thread the outputs together. In practice this knowledge lives only in the impeccable skill's own routing rules; design-ui re-exposes it implicitly to its callers, which means workflow phases (`/tdd`, `/chore`, `/document`) cannot reliably route design work through design-ui without each caller learning impeccable's vocabulary.

Concrete observable: in the recent site-build pass on this repo (FAQ accordion, hero symbols, strata stagger, 404 page, delight additions), the conversation invoked `/impeccable craft`, `/impeccable audit`, `/impeccable delight` directly from main context, bypassing design-ui entirely. design-ui was visited zero times despite the work being entirely within its mandate. A skill that can be skipped without consequence is a skill that does not exist structurally.

A second observable: there is currently no way for the spec phase to declare "this feature has a design layer". Specs that touch `site-src/**` or `app/**` files are indistinguishable from specs that touch pure-backend files. Design work therefore has no structural footprint in the spec → tdd → integrate pipeline.

## Goal

Every design task inside a workflow phase routes through `design-ui`, and `design-ui` always invokes `impeccable` under the hood. The orchestration is captured once in a skill that downstream phases call, instead of memorised by each caller.

## Non-goals

- Editing the vendored `impeccable` skill. Per CLAUDE.md Article IX vendoring discipline, the skill stays untouched; the override layer lives in design-ui.
- Adding new impeccable subcommands. The existing ~20-command vocabulary is sufficient; design-ui is a router, not a vocabulary extender.
- Changing how individual impeccable subcommands behave. design-ui only decides *which* command to invoke and *in what sequence*, never *what the command does*.
- Adding a write-boundary hook to enforce routing. The spec-lint rule plus Article X.2 plus `/tdd` Step 6 are structural enough; a hook on every UI-file write is overreach.
- Making the orchestration multi-threaded. Sequential subcommand invocation is sufficient. Parallel `audit ∥ critique` is documented but not implemented in v1.
- Backwards compatibility with any external caller of design-ui v1's code-writing role. design-ui has been called zero times in the project's lifetime (per the observable above); a clean break is acceptable.

## Success metrics

- **Routing coverage** — 100% of design tasks in workflow phases route through design-ui, measured by: every spec whose `write_set` intersects `project.json → tdd.ui_globs` declares a `design_calls[]` array; spec-lint rejects any that don't. Baseline: 0% (no enforcement today). Target: 100%. Source: spec-lint exit status across the repo's specs.
- **Impeccable dependency** — every `Skill(design-ui, …)` invocation that performs a design move makes ≥ 1 `Skill(impeccable, …)` invocation. Baseline: undefined (design-ui v1 has been called zero times). Target: ≥ 1. Source: design-ui state file `.claude/state/design/<slug>.json → invocations[]` array.
- **Test count** — existing 84 tests continue passing; ≥ 7 new tests added (one per AC-1 through AC-7 below). Source: `npm test`.
- **Audit drift** — `audit-baseline` returns PASS, 0 fails, 0 warns after the refactor lands. Source: `bash .claude/skills/audit-baseline/audit.sh`.
- **Constitutional surface** — Article X.2 lands in both `CLAUDE.md` and `src/CLAUDE.template.md`. Source: `tests/template-drift.test.mjs` continues to pass.

## Stakeholders

- **Requester**: razieldecarte@gmail.com (project owner driving the baseline's development).
- **Reviewer**: razieldecarte@gmail.com (single-developer project; review and ownership co-located).
- **Operator** (who fields the consequences in prod): every team that runs `npx create-baseline <target>` and adopts the new design lane. The baseline is shipped, not operated by the requester; the operator population is the set of installing teams.

## Constraints

- The vendored `impeccable` skill at `.claude/skills/impeccable/` SHALL remain byte-identical to its current state. Any override or scoping rule belongs in design-ui or in CLAUDE.md Article X.
- The new Article X.2 SHALL bind alongside Articles I–IX without contradicting them. Per Article I.4 precedence, if Article X.2 ever conflicts with a future amendment to Articles I–IX, the higher-precedence article wins; X.2 is then amended or retired.
- The 84 existing tests must continue passing throughout the refactor. New tests are additive.
- The audit-baseline drift check must continue passing after the new fields land. This means: `audit.sh` checks for `tdd.ui_globs` in project.json (template-pristine version: empty array or sensible default), checks for Article X.2 in CLAUDE.md, and checks the design-ui SKILL.md surface.
- The `template-drift.test.mjs` invariant must continue passing: any constitutional change to `CLAUDE.md` must mirror to `src/CLAUDE.template.md` in the same commit.
- spec-lint runs at the write boundary today (via `plantuml_syntax_guard`, `spec_diagram_presence_guard`). The new `design_calls[]` rule must integrate with the same enforcement path, not duplicate it.
- `.claude/state/design/` is a new directory under `.claude/state/` (which is already gitignored per `.gitignore`). No new gitignore entry needed.

## Acceptance criteria

1. Given a `task_brief` with intent `"add input validation to the settings form"` (a behavior concern, not a design concern), when `Skill(design-ui, …)` is invoked, then design-ui returns `final_state: "not_a_design_task"` with a pointer naming `/tdd` as the correct lane.
2. Given a `task_brief` with intent `"build a settings page that doesn't feel like a SaaS template"`, when `Skill(design-ui, …)` is invoked, then design-ui produces a recipe of `["shape", "craft", "audit"]` and yields to the user for approval before executing (multi-step → ask).
3. Given a `task_brief` with intent `"polish the FAQ"` against an existing FAQ surface, when `Skill(design-ui, …)` is invoked, then design-ui executes `["audit", "polish"]` without asking for approval (single-step recipe is auto-executed after a single audit).
4. Given a spec whose `write_set` includes `app/settings/page.tsx` (a path matched by `project.json → tdd.ui_globs`), and whose markdown contains no `design_calls[]` block, when `spec-lint` runs against the spec, then spec-lint exits non-zero with an error message naming the missing `design_calls[]` block.
5. Given a `/tdd` run whose implement step's `write_set` writes one file matching `tdd.ui_globs`, and whose approved spec declares exactly one entry in `design_calls[]`, when `/tdd` reaches its new Step 6, then design-ui is invoked exactly once with the declared design call's intent, target_files, and write_set.
6. Given a design-ui orchestration where `polish` does not reach P0 = 0 and P1 = 0 after three iterations, when the third re-`audit` returns non-zero P0+P1 count, then design-ui terminates with `final_state: "needs_human"`, persists the audit report at `docs/design/<slug>.audit.md`, and surfaces a clear summary to the caller. No fourth iteration runs.
7. Given a design-ui orchestration interrupted between Stage 2 and Stage 3, when `Skill(design-ui, …)` is invoked again with the same slug, then design-ui reads `.claude/state/design/<slug>.json`, resumes from the recorded `step_index`, and does not re-run completed steps.
8. Given the refactor lands, when `tests/template-drift.test.mjs` runs, then the test continues to pass: `src/CLAUDE.template.md` contains the Article X.2 text byte-equal to `CLAUDE.md`.
9. Given the refactor lands, when `bash .claude/skills/audit-baseline/audit.sh` runs, then it returns exit 0 with `fails=0 warns=0`, including new checks for `project.json → tdd.ui_globs` existence and the `design-ui` SKILL.md surface.
10. Given the refactor lands, when `npm test` runs, then all 84 existing tests pass plus the 7+ new tests (AC-1 through AC-7) added during `/tdd`.

## Open questions

- Where does spec-lint's new `design_calls[]` enforcement run: inside `.claude/hooks/spec_diagram_presence_guard.sh` (which already runs at the write boundary on spec files), inside `.claude/skills/spec-lint/lint.sh` (the preflight script), or both? `/research` should compare these and pick.
- What is the right default value for `project.json → tdd.ui_globs` in the pristine template? Candidates: empty array (opt-in per project) vs. a sensible default list like `["site-src/**", "app/**", "components/**", "**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte", "**/*.css", "**/*.scss"]`. The pristine template ships with `configured: false`; `/init-project` populates ui_globs based on detected stack. `/research` should decide whether v1 ships with a default or stays empty.
- Should the `design_calls[]` field in the spec template be required (block save) or recommended (warn but allow)? The acceptance criteria above assume "required when write_set intersects ui_globs"; confirming this is the intended structural enforcement strength.
- Stage 0 classification (design vs development vs copy) — does design-ui infer this from the intent string alone (regex/keyword table), or also from the target_files (e.g., a write_set of pure `.ts`/`.go`/`.py` files heavily implies development)? `/research` should propose the discriminator.
- For Stage 2 intent classification, the locked design has ~18 intent patterns. Should the table live inline in `SKILL.md` or in a separate `references/intent-table.md`? The locked spec said the latter; confirming the SKILL.md should hold only a summary table plus a pointer.
- Does `audit-baseline` need to verify the `design_calls[]` block on every spec under `docs/specs/`, or only on the spec for the current `workflow.json` slug? `/spec` decides.
