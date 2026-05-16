# design-ui mixed_brief — Stage 0 structured decomposition for multi-lane briefs

## Context

| Input | Path |
|---|---|
| Intake | — (excepted at triage; Q-007 is the source) |
| BRD *(if any)* | — |
| Scout *(if any)* | `docs/scout/design-ui-mixed-brief.md` |
| Research *(if any)* | — (excepted at triage; no third-party API involved) |
| Memory source | `.claude/memory/pending-questions.md` Q-007 |

## Goal

`design-ui` Stage 0 emits a new terminal state `mixed_brief` with a structured `lane_split` array when a `task_brief` spans multiple lanes, instead of collapsing to `not_a_design_task` or asking the user interactively. Single-lane misroutes still return `not_a_design_task` (backwards-compatible).

## Non-goals

- design-ui does NOT execute any lane when it returns `mixed_brief`. It only classifies and reports. The architectural commitment from Article X.2 (design-ui is single-lane) is preserved.
- The vendored `impeccable` skill is not touched (Article IX).
- `/tdd`, `/chore`, `/document`, `prose`, and `scenario` are not edited in this spec. Only design-ui's contract changes; callers consume the new shape via the canonical caller-policy table in `references/orchestration.md` (which they already read today for `complete` / `needs_human` / `blocked` / `not_a_design_task`).
- Article X.2's Stage-0 row gets a wording amendment, but Article X.2's overall lane-routing policy is unchanged.

## Design

Diagrams are the contract.

### C4 — System context

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — design-ui Stage 0 amendment
Person(caller, "Caller (harness design-ui-tick, /chore, /document, direct user)", "Hands design-ui a task_brief; consumes Report")
Person(specauthor, "Spec author", "Writes ## Design calls rows that become task_briefs at /tdd Step 6")
System(designui, "design-ui skill", "Single-lane classifier + impeccable orchestrator; markdown-driven contract")
System_Ext(impeccable, "impeccable skill (vendored, Apache 2.0)", "Executes design moves")
System_Ext(statefile, "State file", ".claude/state/design/<slug>.json")
Rel(specauthor, caller, "Authors spec rows that drive callers")
Rel(caller, designui, "Skill(design-ui, task_brief)")
Rel(designui, statefile, "Writes checkpoint per stage")
Rel(designui, impeccable, "Skill(impeccable, cmd, args) — only on design-lane intents")
Rel(designui, caller, "Returns Report{ final_state, lane_split? }")
@enduml
```

### C4 — Container

The "system" is the design-ui skill on disk. Its "containers" are the markdown files that together form the skill's contract.

```plantuml
@startuml
!include <C4/C4_Container>
title Container — design-ui skill
System_Boundary(designui, "design-ui skill") {
  Container(skillmd, "SKILL.md", "Markdown contract", "Canonical entry-point; Stage 0–4 prose; Report shape")
  Container(dvd, "references/design-vs-development.md", "Markdown", "Mirrors SKILL.md Stage 0 classification rule")
  Container(it, "references/intent-table.md", "Markdown", "Stage 2 recipe lookup — unchanged")
  Container(orch, "references/orchestration.md", "Markdown", "Stage 3 gates + caller-policy table")
  Container(sm, "references/state-machine.md", "Markdown", "State-file shape + resume rule")
}
ContainerDb(statefile, "State file", "JSON", ".claude/state/design/<slug>.json")
System_Ext(constitution, "CLAUDE.md", "Article X.2")
System_Ext(tests, "tests/design-ui-*.test.mjs", "Node test runner")

Rel(skillmd, dvd, "names canonical-mirror relation")
Rel(skillmd, orch, "references caller-policy table")
Rel(skillmd, sm, "references state-file shape")
Rel(skillmd, statefile, "writes via thin-glue ops")
Rel(constitution, skillmd, "binds Stage 0 + Stage 4 contract")
Rel(tests, skillmd, "asserts contract presence")
Rel(tests, sm, "asserts terminal-state enumeration")
@enduml
```

### C4 — Component (changed container only: SKILL.md)

```plantuml
@startuml
!include <C4/C4_Component>
title Component — SKILL.md stages
Container_Boundary(skillmd, "SKILL.md") {
  Component(s0, "Stage 0 — Classify", "Markdown rule", "Reads task_brief.intent + target_files; emits design / development / copy / mixed / surface-less")
  Component(s1, "Stage 1 — Capture", "Markdown rule", "Verifies PRODUCT.md, derives slug, writes initial state file")
  Component(s2, "Stage 2 — Translate", "Markdown rule", "Reads intent-table; produces (recipe, mode)")
  Component(s3, "Stage 3 — Orchestrate", "Markdown rule", "Runs impeccable recipe step-by-step under gates")
  Component(s4, "Stage 4 — Report", "Markdown rule", "Returns Report{ final_state, lane_split?, ... }")
  Component(misroute, "Misroute branch (CHANGED)", "Markdown rule", "Single-lane → not_a_design_task; multi-lane → mixed_brief + lane_split")
}
Rel(s0, misroute, "branches when not design-only")
Rel(s0, s1, "on lane == design")
Rel(s1, s2, "")
Rel(s2, s3, "")
Rel(s3, s4, "")
Rel(misroute, s4, "short-circuit return")
@enduml
```

### Data model — class diagram

```plantuml
@startuml
title Data model — Report + state file
enum FinalState {
  complete
  needs_human
  blocked
  not_a_design_task
  mixed_brief <<new>>
}
enum Lane {
  design
  development
  copy
}
class Report {
  +slug: string
  +intent: string
  +recipe_executed: List<string>
  +final_state: FinalState
  +files_touched: List<string>
  +verifications: Verifications
  +next_actions: List<string>
  +state_file: string
  +thin_glue_written: List<string>
  +lane_split: List<LaneSplit> <<new, present only when final_state == mixed_brief>>
  +correct_lane: string <<present only when final_state == not_a_design_task>>
  +reason: string <<present only when final_state in {not_a_design_task, mixed_brief, blocked}>>
}
class LaneSplit <<new>> {
  +surface: string
  +lane: Lane
  +reason: string
}
class StateFile {
  +slug: string
  +started_at: string
  +intent: string
  +recipe: List<string>
  +step_index: int
  +invocations: List<InvocationRecord>
  +verifications: List<VerificationRecord>
  +state: FinalState
  +next_actions: List<string>
  +lane_split: List<LaneSplit> <<new, persisted on mixed_brief>>
}
Report "1" *-- "0..*" LaneSplit
StateFile "1" *-- "0..*" LaneSplit
@enduml
```

#### Migration DDL

No database. The state-file shape is JSON; the migration is in-prose and lazy: existing state files (none ship in git; the directory is gitignored) continue to validate without the `lane_split` field; new mixed-brief classifications write the field. No backfill.

```sql
-- forward (in-prose, state-machine.md enum update):
-- ALTER ENUM FinalState ADD VALUE 'mixed_brief';
-- ALTER STATEFILE ADD OPTIONAL FIELD lane_split List<LaneSplit>;
-- reverse:
-- ALTER ENUM FinalState DROP VALUE 'mixed_brief';
-- ALTER STATEFILE DROP OPTIONAL FIELD lane_split;
```

### Behavior — sequence per AC

#### §Behavior #1 — Stage 0 classifies mixed brief, returns mixed_brief + lane_split

```plantuml
@startuml
title Behavior #1 — Mixed brief → mixed_brief + lane_split
actor Caller as "Caller (e.g., harness design-ui-tick)"
participant DesignUI as "design-ui Stage 0"
database State as ".claude/state/design/<slug>.json"

Caller -> DesignUI : Skill(design-ui, task_brief)\n{intent, target_files: [page.tsx, faq.md, readme.md, install.md, error-handler.ts, button-label.tsx, settings/page.tsx], ...}
DesignUI -> DesignUI : Apply per-concern rule\nintent matches design pattern\ntarget_files spans 3 lanes
note right of DesignUI
  Per-surface classification:
   - page.tsx          → design
   - faq.md            → copy
   - readme.md         → copy
   - install.md        → copy
   - error-handler.ts  → development
   - button-label.tsx  → copy
   - settings/page.tsx → development
end note
DesignUI -> State : write {state: "mixed_brief", lane_split: [...], step_index: 0, ...}
DesignUI --> Caller : Report{\n  final_state: "mixed_brief",\n  lane_split: [\n    {surface: "page.tsx",          lane: "design",      reason: "intent matches design row; tsx under ui_globs"},\n    {surface: "faq.md",            lane: "copy",        reason: ".md + intent contains 'rewrite'"},\n    {surface: "error-handler.ts",  lane: "development", reason: "logic file"},\n    ...\n  ],\n  reason: "task_brief spans design + development + copy lanes",\n  next_actions: ["Caller fans out per lane_split"]\n}
Caller -> Caller : Read lane_split; fan out per row
@enduml
```

#### §Behavior #2 — Re-invocation with same slug returns cached lane_split (sticky resume)

```plantuml
@startuml
title Behavior #2 — Sticky resume for mixed_brief
actor Caller
participant DesignUI as "design-ui Stage 0"
database State as ".claude/state/design/<slug>.json"

Caller -> DesignUI : Skill(design-ui, task_brief) with same slug
DesignUI -> State : read existing
State --> DesignUI : {state: "mixed_brief", lane_split: [...]}
DesignUI --> Caller : Report{\n  final_state: "mixed_brief",\n  lane_split: <same as previously cached>,\n  reason: "cached classification; delete state file to re-classify"\n}
note right of Caller
  Sticky resume mirrors the existing
  not_a_design_task behavior at
  state-machine.md:101.
end note
@enduml
```

#### §Behavior #3 — Single-lane misroute still returns not_a_design_task (backwards-compat)

```plantuml
@startuml
title Behavior #3 — Pure-copy brief → not_a_design_task (unchanged)
actor Caller
participant DesignUI as "design-ui Stage 0"
database State as ".claude/state/design/<slug>.json"

Caller -> DesignUI : Skill(design-ui, task_brief)\n{intent: "rewrite the install instructions", target_files: [docs/install.md], ...}
DesignUI -> DesignUI : Apply per-concern rule\nAll surfaces classify as copy
DesignUI -> State : write {state: "not_a_design_task", ...}
DesignUI --> Caller : Report{\n  final_state: "not_a_design_task",\n  correct_lane: "/document",\n  reason: "All surfaces classify as copy; route to prose"\n}
note right of Caller
  No lane_split field present.
  Caller routes to /document.
end note
@enduml
```

#### §Behavior #4 — Caller policy: fan out on mixed_brief

```plantuml
@startuml
title Behavior #4 — Caller fan-out per lane_split
actor User
participant Harness as "harness (design-ui-tick)"
participant DesignUI as "design-ui"
participant TDD as "/tdd (scenario+implement)"
participant Prose as "prose / humanizer"

User -> Harness : /harness resumes at design-ui-tick
Harness -> DesignUI : Skill(design-ui, task_brief)
DesignUI --> Harness : Report{ final_state: "mixed_brief", lane_split: [...] }
note right of Harness
  Per references/orchestration.md
  caller-policy table mixed_brief row:
  Read lane_split. For each row:
    - lane=design      → re-invoke design-ui with surface-scoped sub-brief
    - lane=development → record on next_actions; do NOT auto-invoke /tdd in this tick
    - lane=copy        → record on next_actions; do NOT auto-invoke prose in this tick
  Then surface a one-line summary to the user.
end note
Harness -> User : "design-ui returned mixed_brief.\nDesign surfaces (1): [page.tsx] — re-invoking design-ui.\nNon-design surfaces (6): see lane_split; caller will not auto-route.\nProceed, or split the ## Design calls row?"
@enduml
```

The "do NOT auto-invoke" choice for non-design lanes is deliberate: auto-routing into `/tdd` and `prose` from inside a design-ui-tick would expand the tick's blast radius beyond its declared write_set and bypass the spec author's ability to split their `## Design calls` row deliberately. Surfacing keeps the spec author in control.

### State — core entity

The state file's `state` field is a finite-state model. The amendment adds one terminal state.

```plantuml
@startuml
title State — design-ui orchestration (state file `state` field)
[*] --> in_progress : Stage 0/1 classify as design
[*] --> not_a_design_task : Stage 0 classifies as pure development OR copy
[*] --> mixed_brief : Stage 0 classifies as multi-lane <<new>>
in_progress --> complete : final audit passes
in_progress --> needs_human : audit→polish loop hits cap 3
in_progress --> blocked : P0 finding / parent dir missing / user refuses recipe
not_a_design_task --> [*] : caller routes to correct_lane
mixed_brief --> [*] : caller fans out per lane_split <<new>>
complete --> [*]
needs_human --> [*]
blocked --> [*]
@enduml
```

### Dependencies — graph

Edge `A --> B` reads "A depends on B" (A reads or cites B; changes to B force re-verification of A).

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — design-ui contract amendment
left to right direction
[SKILL.md (canonical Stage 0 + Stage 4)] --> [references/state-machine.md]
[SKILL.md (canonical Stage 0 + Stage 4)] --> [references/orchestration.md]
[references/design-vs-development.md (mirror)] --> [SKILL.md (canonical Stage 0 + Stage 4)]
[references/orchestration.md] --> [references/state-machine.md]
[CLAUDE.md Article X.2] --> [SKILL.md (canonical Stage 0 + Stage 4)]
[tests/design-ui-classification.test.mjs] --> [SKILL.md (canonical Stage 0 + Stage 4)]
[tests/design-ui-classification.test.mjs] --> [references/design-vs-development.md (mirror)]
[tests/design-ui-orchestration.test.mjs] --> [references/state-machine.md]
[tests/design-ui-orchestration.test.mjs] --> [references/orchestration.md]
[harness design-ui-tick (consumer)] --> [references/orchestration.md]
@enduml
```

### Contracts

The skill exposes one orchestration contract. The amendment changes the Report shape only.

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Skill | `Skill(design-ui, task_brief)` | `task_brief` per SKILL.md schema (concern, intent, slug?, target_files, write_set, register_override?, references?) | `Report{ slug, intent, recipe_executed, final_state ∈ {complete, needs_human, blocked, not_a_design_task, mixed_brief}, files_touched, verifications, next_actions, state_file, thin_glue_written, lane_split?, correct_lane?, reason? }` | Returned as `final_state: "blocked"` with `reason` | Yes (same slug → cached Report; sticky for terminal states) |

`lane_split` is present only when `final_state == "mixed_brief"`; `correct_lane` only when `final_state == "not_a_design_task"`; `reason` is present on all non-success terminal states.

### Libraries and versions

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| *(none — markdown contract amendment; no third-party APIs)* | — | — | n/a |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| Auto-decompose at Stage 0 | design-ui itself splits the brief, invokes design portions via impeccable, also routes non-design surfaces into `/tdd` / `prose` | Couples design-ui to `/tdd` and `prose` input contracts; collapses Article X.2's per-lane structural separation; violates "design-ui stays single-lane" guardrail |
| Per-surface `mixed_brief: true` flag in `task_brief` | Caller declares upfront; design-ui returns results per-lane | Same coupling problem; pushes lane modeling into the input schema; doubles the API surface |
| Status quo + better error message | Keep returning `not_a_design_task` but with a richer prose `reason` describing the mixed-lane case | Doesn't structurally help callers; they still have to re-classify by reading prose |
| Hard-block: refuse mixed briefs | Return `final_state: "blocked"`; force spec author to split the `## Design calls` row | Too rigid for ad-hoc direct-user invocations; pushes friction onto every caller including main-context exploration |
| Auto-execute design lane, record others on `next_actions` | design-ui runs the design portion of a mixed brief, surfaces non-design on next_actions | Expands the tick's blast radius beyond its declared write_set; reduces caller agency to defer the design portion |

## Design calls

Implementation write_set: `.claude/skills/design-ui/SKILL.md`, `.claude/skills/design-ui/references/{design-vs-development,orchestration,state-machine}.md`, `CLAUDE.md`, `tests/design-ui-classification.test.mjs`, `tests/design-ui-orchestration.test.mjs`. None intersect `project.json → tdd.ui_globs` — markdown-only contract amendment, no UI surface.

- *(none)*

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | Given a `task_brief` whose target_files span ≥ 2 lanes per the per-concern rule in `design-vs-development.md`, when Stage 0 classifies, then design-ui returns `Report{ final_state: "mixed_brief", lane_split: [...], reason }` and writes `state: "mixed_brief"` to the state file | Q-007 | §Behavior #1 |
| AC-002 | Given a `mixed_brief` Report, when the caller reads `lane_split`, then every entry has shape `{ surface: string, lane: "design"\|"development"\|"copy", reason: string }` and `lane_split.length == target_files.length` (one row per surface) | Q-007 | §Behavior #1 |
| AC-003 | Given Stage 0 has classified a brief as `mixed_brief`, when design-ui returns, then no `Skill(impeccable, ...)` was invoked and no product code was written for this invocation | architectural guardrail | §Behavior #1 |
| AC-004 | Given a state file at `.claude/state/design/<slug>.json` with `state: "mixed_brief"`, when design-ui is re-invoked with the same slug, then it returns the cached Report (sticky resume) without re-running Stage 0 | scout risk: sticky resume mirroring | §Behavior #2 |
| AC-005 | Given a `task_brief` whose target_files all classify as a single non-design lane (pure copy OR pure development), when Stage 0 classifies, then design-ui returns `Report{ final_state: "not_a_design_task", correct_lane, reason }` — the existing single-lane misroute path is unchanged | backwards-compat | §Behavior #3 |
| AC-006 | Given `.claude/skills/design-ui/references/state-machine.md`, when read, then it documents `mixed_brief` in the `state` enum (line ~24), in the terminal-state table (lines ~80–88), and in the resume-logic block (mirrors the `not_a_design_task` sticky rule) | scout: three-place sync | static doc check |
| AC-007 | Given `.claude/skills/design-ui/references/orchestration.md`, when read, then the caller-policy table has a row for `mixed_brief` declaring: "Read `lane_split`. For lane=design rows, re-invoke design-ui with a scoped sub-brief. For lane=development and lane=copy rows, record on `next_actions` and surface a one-line summary to the user; do NOT auto-invoke `/tdd` or `prose` in this tick." | scout: caller-policy required | §Behavior #4 |
| AC-008 | Given `.claude/skills/design-ui/SKILL.md`, when read, then Stage 4's Report shape (around line 120) lists `"mixed_brief"` among `final_state` values, declares the optional `lane_split` field, and Stage 0's prose (around lines 44–61) names the two-branch misroute (single-lane vs multi-lane) | scout: SKILL.md is canonical | §Behavior #1 |
| AC-009 | Given `.claude/skills/design-ui/references/design-vs-development.md`, when read, then the file's Misroute-handling block names SKILL.md as the canonical source and documents itself as the mirror; the prior "Mixed → return to step 1 with the user surfaced; ask which concern they mean" rule is replaced by a pointer to the SKILL.md `mixed_brief` return | scout: drift risk | §Behavior #1 |
| AC-010 | Given `CLAUDE.md`, when read, then Article X.2's Stage-0-misroute row (line 264) names BOTH `not_a_design_task` (single-lane misroute) AND `mixed_brief` (multi-lane misroute with structured `lane_split`), preserving the constitutional binding | scout: Article X.2 drift | static doc check |
| AC-011 | Given `tests/design-ui-classification.test.mjs`, when run, then it asserts (in addition to existing assertions) that SKILL.md mentions `mixed_brief` in its Stage 0 prose and documents the `lane_split` field; and `tests/design-ui-orchestration.test.mjs` asserts that `mixed_brief` appears in state-machine.md's terminal-state enumeration | scout: enumerated test | §Behavior #1 + §Behavior #4 |

## Test plan

Skill amendment; no executable runtime. Tests are static doc assertions over markdown files via `tests/design-ui-*.test.mjs`.

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | Mixed brief (1 design + 5 copy + 1 dev) hits Stage 0 — assertion: SKILL.md prose describes the `lane_split` return for multi-lane briefs | `lane_split` field documented; `mixed_brief` literal appears in Stage 0 + Stage 4 | AC-001, AC-002, AC-008 |
| Golden path | Caller-policy table row for `mixed_brief` exists | row asserts fan-out behavior including the "do NOT auto-invoke" clause | AC-007 |
| Input boundary | Single-lane misroute (pure copy: `["docs/install.md"]`) | `not_a_design_task` literal still appears in SKILL.md as the single-lane misroute terminal | AC-005 |
| Input boundary | Surface-less brief (intent="tokens" with empty target_files) | unchanged from current behavior — still routes per intent-table.md (not relevant to mixed_brief) | regression — AC-005 stays passing |
| Contract violation | State-file `state` enum must include both `not_a_design_task` and `mixed_brief` literally | state-machine.md enum line + terminal-state table both name both states | AC-006 |
| Contract violation | Constitution: CLAUDE.md Article X.2 row 1 mentions both `not_a_design_task` and `mixed_brief` | regex finds both literals on the same Article X.2 row | AC-010 |
| Concurrency / ordering | n/a — markdown contract has no concurrency | — | — |
| Failure mode | Re-invocation with same slug after `mixed_brief` returns cached Report | state-machine.md resume-logic explicitly says: "Present and `state` is `mixed_brief` → return the existing Report; the misroute is sticky for this slug" | AC-004 |
| Regression trap | The four pre-existing terminal-state literals (`complete`, `needs_human`, `blocked`, `not_a_design_task`) all still appear in state-machine.md | unchanged | regression — existing `design-ui-orchestration.test.mjs:67` enumeration still passes |
| Regression trap | All seven `task_brief` schema fields (`concern`, `intent`, `slug`, `target_files`, `write_set`, `register_override`, `references`) still documented in SKILL.md | unchanged | regression — existing `design-ui-classification.test.mjs` test_when_design_ui_skill_md_then_documents_task_brief_schema |
| Regression trap | The 3-iteration cap text in orchestration.md still parses for the existing orchestration test | unchanged | regression — existing `design-ui-orchestration.test.mjs` cap-3 test |

### Test file updates

- `tests/design-ui-classification.test.mjs`
  - **Extend** existing test `test_when_design_ui_skill_md_exists_then_describes_stage_0_classification` to also assert `mixed_brief` appears in SKILL.md (in addition to `not_a_design_task`).
  - **Add** new test `test_when_design_ui_skill_md_then_documents_lane_split_field` asserting `lane_split` is named in the Stage 4 Report shape and described with the `{ surface, lane, reason }` shape.
  - **Add** new test `test_when_design_vs_development_md_then_designates_skill_md_as_canonical` asserting the file body contains language like "canonical" referring to SKILL.md (e.g., "SKILL.md is the canonical source; this file mirrors it").
- `tests/design-ui-orchestration.test.mjs`
  - **Extend** existing test `test_when_state_machine_md_then_documents_terminal_states` to add `'mixed_brief'` to the loop at line 67 (so the array is `['complete', 'needs_human', 'blocked', 'not_a_design_task', 'mixed_brief']`).
  - **Add** new test `test_when_state_machine_md_then_documents_mixed_brief_sticky_resume` asserting the resume-logic block explicitly mentions `mixed_brief` as sticky.
  - **Add** new test `test_when_orchestration_md_then_has_mixed_brief_caller_policy_row` asserting the caller-policy table contains a row keyed on `mixed_brief` with prose mentioning `lane_split`, "fan out", and "do NOT auto-invoke" (or equivalent regex).

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| State-file `state` | `state: "mixed_brief"` in `.claude/state/design/<slug>.json` | enum value | Inspect post-hoc which orchestrations were mixed |
| Harness log | `entered design-ui-tick` / `completed design-ui-tick` in `.claude/state/harness/<slug>.log` | text lines | Confirm the tick ran and returned cleanly |
| Memory pending | Q-007 closed in `pending-questions.md` with `CLOSED <date>` block | markdown | Audit trail for the design decision |

No metrics, no alarms — this is a contract amendment to a developer-tool skill, not a runtime-observable system.

## Rollout

- **Feature flag**: none. Skill amendments take effect at the next read; the skill is interpreted prose, not compiled code.
- **Migration order**: 1. Update `SKILL.md` Stage 0 + Stage 4 → 2. Update `references/state-machine.md` enum + terminal-state table + resume block → 3. Update `references/orchestration.md` caller-policy table → 4. Update `references/design-vs-development.md` to point at SKILL.md as canonical → 5. Update `CLAUDE.md` Article X.2 row → 6. Update tests. Order is significant: tests assert the prose presence, so prose must precede test edits in commit-order; but inside a single commit, both must be present and consistent.
- **Canary**: n/a. The very next `Skill(design-ui)` invocation observes the new contract.

## Rollback

- **Kill-switch**: `git revert <commit>`. The seven affected files revert atomically.
- **Signal to roll back**: any of `tests/design-ui-*.test.mjs` failing after the change is merged, OR a workflow that hits Stage 0 mid-flight and observes a Report shape that doesn't match its caller-policy table reading. Detection window: < 5 minutes (the next `/integrate` run).

## Archive plan

- Defaults *(automatic)*: scout, spec, spec-rendered/, spec approval.
- Extras *(list any non-default files)*:
  - *(none)*

## Open questions

- *(none — the three decisions flagged in scout risks are resolved here:)*
  - **Caller action for `mixed_brief`**: fan out per `lane_split`; design-ui does NOT auto-execute the design lane in the same invocation (preserves caller agency, keeps tick blast-radius bounded). See §Behavior #4 + AC-007.
  - **Sticky-on-resume**: mirrors `not_a_design_task` — re-invocation with the same slug returns the cached Report. Delete the state file to re-classify. See §Behavior #2 + AC-004.
  - **Canonical source for misroute prose**: `SKILL.md` Stage 0 is canonical; `references/design-vs-development.md` mirrors. See AC-008 + AC-009.
