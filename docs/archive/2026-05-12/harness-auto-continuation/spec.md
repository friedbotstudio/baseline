# Spec — harness auto-continuation across non-yield workflow phases

<!--
Technical spec. Produced by the `spec` skill.

Guard-enforced invariants:
  - Required ## headings (artifact_template_guard, project.json → artifacts.required_sections.spec):
        Goal, Design, Design calls, Acceptance criteria, Test plan.
  - Required diagram kinds inside ```plantuml``` fences
    (spec_diagram_presence_guard, configured in project.json →
     artifacts.required_diagrams.spec):
        c4_context, c4_container, c4_component,
        sequence, class, dependency_graph.
  - Every ```plantuml``` fence must parse (plantuml_syntax_guard).

Approval: NEVER add "Status: Approved" — spec_approval_guard blocks it.
Approval is a token written by /approve-spec.
-->

## Context

| Input | Path |
|---|---|
| Intake | `docs/intake/harness-auto-continuation.md` |
| BRD | *(none — internal architecture)* |
| Scout | `docs/scout/harness-auto-continuation.md` |
| Research | `docs/research/harness-auto-continuation.md` |

## Goal

After this spec ships, the 11-phase workflow advances autonomously through every non-gated phase using a Stop-event hook plus a single-file state machine; the user types nothing between non-gated phases, and the only user-prompt boundaries are consent gates and integrate-failure-needs-spec-change decisions.

## Non-goals

- Not changing the semantics of consent gates A/B/C (`/approve-spec`, `/approve-swarm`, `/grant-commit`). They remain structurally un-forge-able per Article IV.
- Not editing any vendored skill (`impeccable`, `humanizer`, `code-structure`, `documentation`, `technical-tutorials`, `copywriting`, `claude-automation-recommender`) — Article IX.
- Not adding a new subagent — Article II reserves subagents for `/swarm-dispatch` only; auto-continuation runs in main context.
- Not changing the byte format of `.claude/state/last_test_result`. The `verify_pass_guard` hook reads line 1 of this file as the single source of truth.
- Not introducing a polling loop or sleep-based continuation. The mechanism is event-driven via the Stop hook.
- Not changing the `swarm-dispatch` worker subagent model — workers have their own turn-loop and do not exhibit the parent-SOP-resume pause.

## Design

Diagrams are the contract. Prose is only for things a diagram cannot say.

### C4 — System context

Who interacts with the system, and which external systems it depends on.

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — harness auto-continuation
Person(user, "Project owner", "Drives the workflow; reviews artifacts; runs consent gates")
System(harness, "Workflow harness", "Claude Code skill that chains phase skills and yields at gates")
System_Ext(claudecode, "Claude Code runtime", "Executes Claude turns; dispatches tool calls; fires hooks at lifecycle events")
System_Ext(fs, "Local filesystem", "Holds workflow.json, harness_state, task list, hook scripts, skill SOPs")
Rel(user, harness, "Invokes /harness; runs /approve-spec when ready")
Rel(harness, claudecode, "Invokes phase skills via Skill tool")
Rel(claudecode, harness, "Fires Stop event after each turn")
Rel(harness, fs, "Reads/writes workflow.json, harness_state; writes per-phase logs")
Rel(claudecode, fs, "Reads hook scripts; reads skill SOPs")
@enduml
```

### C4 — Container

Deployable units inside the system boundary and how they communicate.

```plantuml
@startuml
!include <C4/C4_Container>
title Container — harness auto-continuation
System_Boundary(sut, "Workflow harness") {
  Container(harness_skill, "harness skill", "Markdown SOP", "Per tick: read state, invoke one Skill(phase), write harness_state, return")
  Container(phase_skills, "Phase skills", "Markdown SOPs (intake, scout, research, spec, tdd, simplify, security, integrate, document, archive, commit)", "Each does one job; writes its outputs; sets harness_state on completion")
  Container(stop_hook, "harness_continuation hook", "Bash plus python3 stdlib (no jq)", "On Stop event: read harness_state, emit block decision when appropriate; else silent")
  Container(consent_hook, "consent_gate_grant hook", "Bash plus python3 (existing)", "UserPromptSubmit: writes single-use consent markers (unchanged by this spec)")
  ContainerDb(state_dir, "State directory", ".claude/state/ JSON plus markers plus logs", "workflow.json, harness_state, last_test_result, harness/<slug>.log, consent markers")
  ContainerDb(config, "project.json plus settings.json", "Configuration JSON", "Adds harness key; settings.json wires the new Stop hook")
}
Rel(harness_skill, phase_skills, "Skill tool invocation (one per tick)")
Rel(harness_skill, state_dir, "Reads workflow.json; writes harness_state")
Rel(phase_skills, state_dir, "Writes phase artifacts; updates workflow.json completed list")
Rel(stop_hook, state_dir, "Reads harness_state")
Rel(stop_hook, config, "Reads project.json harness key")
Rel(harness_skill, config, "Reads project.json")
@enduml
```

### C4 — Component (changed containers only)

#### Component: harness skill (per-tick lifecycle)

```plantuml
@startuml
!include <C4/C4_Component>
title Component — harness skill tick
Container_Boundary(harness_skill, "harness skill") {
  Component(preflight, "Preflight", "Markdown step", "Read project.json (configured flag); read _resume.md; detect divergence")
  Component(tasklist_read, "TaskList reader", "Markdown step plus TaskList tool", "List pending tasks; pick lowest-id unblocked task")
  Component(yield_branch, "Yield decision", "Markdown step", "When the task is needs_user: write yielded harness_state, emit consent prompt, return")
  Component(invoke, "Phase invocation", "Markdown step plus Skill tool", "TaskUpdate to in_progress; log entered phase; invoke Skill of that phase")
  Component(state_writer, "harness_state writer", "Bash heredoc", "After phase Skill returns: write continue or done harness_state; emit terminal message")
}
Rel(preflight, tasklist_read, "passes control")
Rel(tasklist_read, yield_branch, "next pending task")
Rel(yield_branch, invoke, "task is not needs_user")
Rel(invoke, state_writer, "phase Skill completes")
@enduml
```

#### Component: harness_continuation Stop hook (5-rung detection ladder)

```plantuml
@startuml
!include <C4/C4_Component>
title Component — harness_continuation Stop hook
Container_Boundary(stop_hook, "harness_continuation.sh") {
  Component(rung1, "Rung 1 stop_hook_active", "Bash payload_get", "Silent when the payload stop_hook_active flag is set")
  Component(rung2, "Rung 2 file presence", "Bash test", "Silent when harness_state file is missing or unreadable")
  Component(rung3, "Rung 3 state value", "python3 json.load", "Silent unless state is continue")
  Component(rung4, "Rung 4 freshness", "Bash arithmetic", "Silent when now minus written_at exceeds continue_window_seconds")
  Component(rung5, "Rung 5 tick cap", "Bash arithmetic", "Silent when tick_count has reached max_ticks_per_session")
  Component(emit_block, "Decision emitter", "printf JSON", "Emit block decision instructing Claude to invoke Skill(harness)")
}
Rel(rung1, rung2, "pass")
Rel(rung2, rung3, "pass")
Rel(rung3, rung4, "pass")
Rel(rung4, rung5, "pass")
Rel(rung5, emit_block, "pass")
@enduml
```

#### Component: tdd coordinator (decomposition source)

```plantuml
@startuml
!include <C4/C4_Component>
title Component — tdd skill (post-decomposition)
Container_Boundary(tdd_skill, "tdd skill") {
  Component(read_spec, "Read approved spec", "Markdown step", "Load docs/specs/<slug>.md; parse AC table and Design calls")
  Component(decide_recipe, "Decide scenario recipe", "Main context reasoning", "Per AC: name, covers, assertion, fixtures, out-of-scope list")
  Component(decide_contract, "Decide implementation contract", "Main context reasoning", "Per recipe: failing test paths, write_set, behavior contract excerpts, project conventions")
  Component(write_tdd_state, "Write tdd state file", "Bash heredoc", "Write to .claude/state/tdd/<slug>.json the recipe contract and design_calls_rows")
  Component(seed_tasks, "Seed worker tasks", "TaskCreate plus TaskUpdate", "Per worker: scenario, implement, verify-inline, design-ui-per-row (chained addBlockedBy)")
  Component(yield_continue, "Yield continue", "Bash heredoc plus return", "Write continue harness_state; emit message naming next worker; return")
}
Rel(read_spec, decide_recipe, "spec loaded")
Rel(decide_recipe, decide_contract, "recipe ready")
Rel(decide_contract, write_tdd_state, "contract ready")
Rel(write_tdd_state, seed_tasks, "state persisted")
Rel(seed_tasks, yield_continue, "tasks created")
@enduml
```

### Data model — class diagram

```plantuml
@startuml
title Data model — workflow state files
class HarnessState <<new>> {
  +state: enum(continue, yielded, done)
  +reason: string
  +written_at: epoch
  +slug: string
  +tick_count: int
  --
  Path: .claude/state/harness_state
  Format: flat JSON, overwritten each write
  Owner: harness skill (writes); harness_continuation hook (reads)
}
class HarnessConfig <<new>> {
  +continue_window_seconds: int
  +max_ticks_per_session: int
  --
  Path: .claude/project.json key harness
  Format: JSON object
  Defaults: 10 and 20 respectively
  Owner: project owner
}
class WorkflowJson {
  +request: string
  +slug: string
  +entry_phase: enum(intake, spec, tdd, chore)
  +exceptions: string_list
  +completed: string_list
  +created_at: epoch
  +updated_at: epoch
  --
  Path: .claude/state/workflow.json
  Format: flat JSON
  Owner: triage (creates); phase skills (append completed); commit (archives)
}
class LastTestResult {
  +line1: enum(PASS, FAIL)
  +line2: iso_timestamp
  +line3: exact_command_string
  +line4: exit_code
  --
  Path: .claude/state/last_test_result
  Format: 4 lines plus a single trailing newline
  Owner: integrate, simplify, chore, tdd (inlined write); verify_pass_guard reads line 1
  Caveat: byte-format preserved; this spec does NOT change it.
}
class TddCoordinatorState <<new>> {
  +slug: string
  +recipe: object_list
  +contract: object
  +design_calls_rows: object_list
  --
  Path: .claude/state/tdd/<slug>.json
  Format: flat JSON
  Owner: tdd coordinator (writes); harness (reads on next tick)
}
HarnessState "1" -- "1" WorkflowJson : binds via slug
HarnessConfig "1" -- "many" HarnessState : tunes
WorkflowJson "1" -- "0..1" TddCoordinatorState : produced during tdd phase
@enduml
```

#### File-state mutations (DDL equivalent)

This work has no database. The "DDL" is a set of file-state mutations applied atomically when this spec lands.

```sql
-- forward (paths relative to project root)
CREATE FILE .claude/hooks/harness_continuation.sh
  WITH MODE 0755
  WITH CONTENT (see Behavior #1 plus Component: harness_continuation);

UPDATE .claude/settings.json
  SET hooks.Stop = APPEND_HOOK("harness_continuation.sh")
  AFTER hook "memory_stop.sh";

UPDATE .claude/project.json
  ADD KEY "harness" = {
    "continue_window_seconds": 10,
    "max_ticks_per_session": 20
  };

UPDATE .claude/skills/harness/SKILL.md
  DELETE FRONTMATTER KEY "disable-model-invocation"
  REPLACE SOP BODY (per Component: harness skill tick);

UPDATE .claude/skills/verify/SKILL.md
  ADD FRONTMATTER KEY "disable-model-invocation: true"
  REPLACE BODY (contract-only doc describing the 4-line last_test_result format);

UPDATE .claude/skills/integrate/SKILL.md
  REPLACE STEP 2 (was: "Invoke verify")
  WITH inlined verify ops plus harness_state write (per Behavior #1);

UPDATE .claude/skills/simplify/SKILL.md
  REPLACE STEP 5 (was: "Invoke Skill(verify)")
  WITH inlined verify ops;

UPDATE .claude/skills/chore/SKILL.md
  REPLACE STEP 4 (was: "Invoke Skill(verify)")
  WITH inlined verify ops;

UPDATE .claude/skills/tdd/SKILL.md
  REPLACE BODY (was: 8 steps nesting Skill(scenario, implement, verify, design-ui))
  WITH thin coordinator (per Component: tdd coordinator);

UPDATE .claude/skills/audit-baseline/audit.sh
  ADD "harness_continuation" TO EXPECTED_HOOKS set
  UPDATE COMMENT "(3)" to "(4)" for lifecycle hooks section;

UPDATE CLAUDE.md
  REWRITE Article V "user-only" paragraph plus Step 1 of /harness section
  ADD ROW TO Article VIII hook table (harness_continuation, Stop, Art. V);

UPDATE docs/init/seed.md
  REWRITE 4.1 header "(21 total)" to "(22 total)" plus update component breakdown
  ADD ROW TO 4.1 hook table for harness_continuation;

UPDATE README.md
  REPLACE line near 14 "21 baseline hooks" with "22 baseline hooks"
  REPLACE line near 308 LAYOUT TREE COMMENT "21 hook scripts" with "22 hook scripts";

-- reverse (rollback)
DELETE FILE .claude/hooks/harness_continuation.sh;
REVERT all UPDATEs above to prior content via git checkout (or, on non-git
projects, restore from the docs/archive bundle this spec's run produced).
```

### Behavior — sequence per AC

Each sequence is the contract. Section anchors here are referenced from the Acceptance criteria table.

#### Behavior #1 — auto-continuation happy path (AC-001)

The user is silent between non-gated phases. After `/integrate` stamps PASS, the next phase fires on the same turn via the Stop hook.

```plantuml
@startuml
title Behavior #1 — auto-continuation across non-gated phase boundary
actor User
participant "Claude (model)" as M
participant "harness skill SOP" as H
participant "integrate skill SOP" as I
participant "harness_continuation.sh (Stop hook)" as SH
participant "filesystem (.claude/state/)" as FS

User -> M : (no input — user is reading another tab)
M -> H : Skill(harness) [previously invoked]
H -> FS : read workflow.json; tasklist
H -> I : Skill(integrate)
I -> FS : (inlined verify) run test.cmd via Bash
FS --> I : exit 0, stdout and stderr captured
I -> FS : write last_test_result (4 lines, PASS)
I -> FS : append integrate to workflow.json completed
I -> FS : write harness_state continue with reason and tick_count
I --> H : terminal text "Integrate green. Workflow continuing."
note over M : Claude turn-ending text rendered.\nClaude Code fires Stop event.
SH -> FS : read harness_state
note over SH : Rung 1 to Rung 5 all pass.
SH --> M : block decision JSON with reason to invoke Skill(harness)
note over M : Claude keeps running the SAME turn.\nClaude reads the reason and makes the tool call.
M -> H : Skill(harness)
H -> FS : read workflow.json; tasklist
H -> H : next pending task is document; not needs_user
H -> I : Skill(document)
note right : Next phase begins. No user prompt fired.
@enduml
```

#### Behavior #2 — gate yield (AC-002)

After `/spec` writes the spec, harness yields at the consent gate; the Stop hook stays silent.

```plantuml
@startuml
title Behavior #2 — gate yield (Stop hook silent)
actor User
participant "Claude (model)" as M
participant "harness skill SOP" as H
participant "spec skill SOP" as S
participant "harness_continuation.sh" as SH
participant "filesystem" as FS

M -> H : Skill(harness)
H -> S : Skill(spec)
S -> FS : write docs/specs/<slug>.md
S -> FS : append spec to workflow.json completed
S --> H : terminal text "Spec drafted."
H -> FS : tasklist next task is needs_user
H -> FS : write harness_state yielded with reason "awaiting /approve-spec"
H --> M : terminal text "Yielded. Run /approve-spec then /harness."
note over M : Stop event fires.
SH -> FS : read harness_state
note over SH : Rung 3 fails because state is yielded.\nExit silent.
note over M : Turn ends naturally. Claude waits.
User -> M : "/approve-spec harness-auto-continuation"
note over M : consent_gate_grant.sh fires on UserPromptSubmit\n(unchanged by this spec; Article IV invariant)
@enduml
```

#### Behavior #3 — tdd decomposition (AC-004)

`/tdd` becomes a thin coordinator. Workers (scenario, implement, verify-inline, design-ui) run as separate harness ticks.

```plantuml
@startuml
title Behavior #3 — tdd decomposition into per-worker ticks
actor User
participant "Claude (model)" as M
participant "harness skill SOP" as H
participant "tdd skill SOP" as T
participant "scenario skill SOP" as Sc
participant "implement skill SOP" as Im
participant "harness_continuation.sh" as SH
participant "filesystem" as FS

== Tick 1: /tdd coordinator ==
M -> H : Skill(harness)
H -> T : Skill(tdd)
T -> FS : read docs/specs/<slug>.md
T -> T : decide scenario recipe (main context)
T -> T : decide implementation contract (main context)
T -> FS : write .claude/state/tdd/<slug>.json
T -> FS : TaskCreate scenario, implement, verify, design-ui tasks chained
T -> FS : write harness_state continue
T --> H : terminal text "Recipe and contract written; tasks seeded."
note over SH : Rungs pass. Emit block decision.
SH --> M : continue with Skill(harness)

== Tick 2: scenario worker ==
M -> H : Skill(harness)
H -> FS : tasklist next is scenario
H -> Sc : Skill(scenario)
Sc -> FS : read tdd state file
Sc -> FS : write failing tests
Sc -> FS : write harness_state continue
Sc --> H : terminal text
SH --> M : continue

== Tick 3: implement worker ==
M -> H : Skill(harness)
H -> Im : Skill(implement)
Im -> FS : RALPH loop; write code; inline verify per loop
Im -> FS : write harness_state continue
Im --> H : terminal text
SH --> M : continue
note right : Subsequent ticks: verify-inline, design-ui per row, then tdd-finalize\nthat appends tdd to workflow.json completed and continues to simplify.
@enduml
```

### State — core entity

The `HarnessState` finite-state model.

```plantuml
@startuml
title State — harness_state file
[*] --> continue : harness writes after non-yield phase completion
continue --> continue : harness writes after each non-yield phase tick
continue --> yielded : harness writes before yielding at consent gate or human decision
continue --> done : harness writes when workflow.json completed contains all non-excepted phases
yielded --> continue : user runs consent command; harness resumes
yielded --> done : workflow ends after archive on non-git project
done --> [*] : terminal — Stop hook is silent; awaits next /harness fresh-start
note right of continue
  Stop hook all rungs pass.
  Emit block decision; same-turn continuation.
end note
note right of yielded
  Stop hook silent (rung 3 fails).
  Turn ends; user prompt required.
end note
note right of done
  Stop hook silent. Workflow complete.
end note
@enduml
```

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — harness auto-continuation
left to right direction
[harness skill] --> [workflow.json]
[harness skill] --> [TaskList]
[harness skill] --> [harness_state]
[harness skill] --> [phase skills]
[harness skill] --> [project.json]
[phase skills] --> [harness_state]
[phase skills] --> [workflow.json]
[phase skills] --> [last_test_result]
[harness_continuation.sh] --> [harness_state]
[harness_continuation.sh] --> [project.json]
[harness_continuation.sh] --> [lib/common.sh]
[settings.json] --> [harness_continuation.sh]
[audit-baseline.sh] --> [harness_continuation.sh]
[CLAUDE.md] --> [harness skill]
[CLAUDE.md] --> [harness_continuation.sh]
[seed.md] --> [harness_continuation.sh]
[README.md] --> [harness_continuation.sh]
[verify_pass_guard.sh] --> [last_test_result]
[tdd coordinator] --> [.claude/state/tdd/]
[harness skill] --> [.claude/state/tdd/]
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Hook | `harness_continuation.sh` (Stop event) | JSON payload on stdin (`session_id`, `transcript_path`, `cwd`, optional `stop_hook_active`) | Stdout: empty (silent) OR `{"decision":"block","reason":"..."}` | Hook exit non-zero is treated as hook failure; treat all internal failures as silent (exit 0) | yes (re-reading harness_state yields the same decision) |
| File | `.claude/state/harness_state` | — | Flat JSON `{state, reason, written_at, slug, tick_count}` | Missing or unparseable: Stop hook silent | yes (overwrite each write) |
| Config | `.claude/project.json` `harness` key | — | `{continue_window_seconds: int (default 10), max_ticks_per_session: int (default 20)}` | Missing keys use defaults | yes |
| File | `.claude/state/tdd/<slug>.json` | — | Flat JSON `{recipe[], contract, design_calls_rows[]}` | Missing on tdd-worker tick: harness surfaces error to user; abort tdd | yes (overwrite each write) |
| File | `.claude/state/last_test_result` | — | 4 lines: PASS or FAIL, ISO timestamp, exact command, exit code, trailing newline | Byte format unchanged from current; verify_pass_guard reads line 1 | yes (overwrite each write) |

### Libraries and versions

This work uses only the Bash and python3 standard library substrate already used by every hook script. No third-party libraries are added. The `context7` MCP confirmation requirement does not apply because no third-party APIs are introduced.

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| bash@5.x (system) | Hook script substrate | `[[ ... ]]`, parameter expansion, heredocs | n/a (system shell) |
| python3@3.x (system) | JSON parsing, file ops | `json.load`, `json.dump`, `pathlib.Path`, `datetime` | n/a (stdlib) |
| Claude Code hook contract | Stop event JSON I/O | `decision: "block"`, `reason`, `stop_hook_active` | yes via the claude-code-guide subagent on 2026-05-12; sources: [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks), [hook-development SKILL.md](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md) |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| A | Stop hook emits `hookSpecificOutput.additionalContext` to inject text into Claude's NEXT turn; user must prompt to fire next turn | Not auto-continuation. The user would still need to type something between phases. Same problem as the bug. |
| B | Stop hook returns `decision: "block"` but with a vague reason like "continue silently" and no Skill(harness) directive | Claude has no instruction for what to do; behavior is unspecified. Stop hook control of continuation depends on the reason being a concrete directive. |
| C | Rebuild every parent SOP so its post-Skill step is itself a forced tool call (the original "structural SOP-text patch" plan) | Doesn't scale to the 13 risky sites identified in scout; brittle to future refactors; doesn't address the user's principle that "skills are independent, harness chains." |
| D | Move verify into its own workflow phase (option c from earlier conversation: workers become harness ticks AND get phase-level visibility in workflow.json) | track_guard.sh and project.json workflow.phases churn; conditional invocation (design-ui only when ui_globs intersect; verify multiple times per RALPH iteration) doesn't fit phase-ordering model. Confirmed at OQ-5 (research). |
| E | Add a per-tick marker file `.harness_tick` instead of using harness_state.written_at freshness | Extra state file; redundant with information already in harness_state; harness must clean up marker on every yield path (easy to miss). |
| F | Walk the session transcript inside the Stop hook to confirm "last assistant tool_use was Skill(harness)" | Parse cost on every Stop event. Doubles transcript walks (memory_stop.sh already walks it). On large sessions (50 MB or larger), risk of hook timeout. harness_state freshness check is structurally equivalent and O(1). |

## Design calls

This spec's `write_set` does not intersect `project.json → tdd.ui_globs`. The intersection check:

- `write_set` paths: `.claude/skills/{harness,verify,integrate,simplify,chore,tdd}/SKILL.md`, `.claude/hooks/harness_continuation.sh`, `.claude/settings.json`, `.claude/project.json`, `.claude/skills/audit-baseline/audit.sh`, `CLAUDE.md`, `docs/init/seed.md`, `README.md`.
- `tdd.ui_globs`: `site-src/**`, `app/**/*.{tsx,jsx}`, `components/**/*.{tsx,jsx,vue,svelte}`, `pages/**/*.{tsx,jsx,vue,svelte}`, `src/**/*.{tsx,jsx,vue,svelte}`, `**/*.html`, `**/*.css`, `**/*.scss`, `**/*.njk`.

Intersection: none. No UI surfaces touched. `spec_design_calls_guard` permits the spec without a populated table.

- *(none)*

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | Given an open workflow at any non-gated, non-excepted phase, when that phase's skill stamps completion (writes `harness_state.state == "continue"`), then the next user prompt is NOT required; the Stop hook emits `decision:block` and Claude invokes `Skill(harness)` on the same turn. Evidence: session JSONL of this slug's `/integrate` run shows zero `type:"user"` events between integrate completion and document start. | intake AC-001 | §Behavior #1 |
| AC-002 | Given a phase whose next pending task carries `metadata.needs_user == true`, when the phase ends, then harness writes `harness_state.state == "yielded"` and the Stop hook stays silent (rung 3 fails). Evidence: session JSONL shows the user's `/approve-spec` prompt as the immediately-following `type:"user"` event. | intake AC-002 | §Behavior #2 |
| AC-003 | Given the post-refactor codebase, `grep '^disable-model-invocation:' .claude/skills/harness/SKILL.md` returns no match; `grep -F '"user-only"' CLAUDE.md` returns no match in the context of `/harness`. | intake AC-003 | §Behavior #1 (model invokes Skill(harness)) |
| AC-004 | Given a `/tdd` invocation in the post-refactor codebase, `grep -E 'Skill\((scenario\|implement\|verify\|design-ui)\)' .claude/skills/tdd/SKILL.md` returns no match. A `/tdd` run on a fixture spec produces 4 or more entries in `.claude/state/harness/<slug>.log` (entered scenario, entered implement, etc.) and 4 or more mid-workflow TaskCreate entries. | intake AC-004 | §Behavior #3 |
| AC-005 | Given a caller of inlined verify (integrate, simplify, chore), the post-run `.claude/state/last_test_result` is byte-identical to the format spec: PASS or FAIL line, ISO timestamp line, exact command line, exit code line, trailing newline. `verify_pass_guard.sh` continues to read line 1 successfully. `grep -F 'Skill(verify)' .claude/skills/{integrate,simplify,chore,tdd}/SKILL.md` returns no match. | intake AC-005 | §Behavior #1 (inlined verify) |
| AC-006 | The `harness_continuation.sh` script contains no string matching `_approval_grant` or `_consent_grant`. Article IV consent gates (spec_approval_guard, swarm_approval_guard, git_commit_guard, consent_gate_grant) remain unmodified. Pre-existing approval-guard tests still pass. | intake AC-006 | §Behavior #2 (consent_gate_grant unchanged) |
| AC-007 | `bash .claude/skills/audit-baseline/audit.sh` exits 0. `EXPECTED_HOOKS` set contains `harness_continuation`. The (3) to (4) comment update is present. CLAUDE.md Article VIII hook table has the new row. seed.md 4.1 header reads "(22 total)" with 4 lifecycle hooks. README.md count references updated to 22. | intake AC-007 | — |
| AC-008 | `node --test --test-reporter=spec tests/*.test.mjs` exits 0 with 104 or more passing tests (the pre-refactor baseline). New tests cover the Stop-hook five-rung ladder, the harness_state write protocol, and the gate-yield silence behavior. | intake AC-008 | — |
| AC-009 | Across this slug's full happy-path run (`/intake` through `/archive`), the session JSONL contains exactly one user prompt that is a consent-gate slash command (`/approve-spec harness-auto-continuation`). Any other user prompts in the run are user-volunteered (review or inspection prompts), not bug-symptom "continue" prompts. Evidence: session JSONL post-archive analysis. | intake AC-009 | §Behavior #1 plus §Behavior #2 |
| AC-010 | The Stop hook is safe to fire when no harness work is in progress: silent when `.claude/state/harness_state` is missing, malformed, stale (older than `continue_window_seconds`), or absent of `state == "continue"`. Unit tests cover each silent case. | intake AC-010 | §Component: harness_continuation Stop hook |

## Test plan

Scenarios by category. The `scenario` skill turns these into failing tests; the test layout matches the existing `tests/*.test.mjs` convention.

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | Stop hook fires after harness writes continue state with fresh written_at and tick_count under cap | emits block decision JSON to stdout; exit 0 | AC-001 |
| Golden path | tdd coordinator writes tdd state file and seeds N worker tasks; harness next tick invokes scenario | tdd state file present; N TaskList entries with addBlockedBy chain | AC-004 |
| Golden path | Inlined verify writes last_test_result from integrate context | file is 4 lines plus trailing newline; line 1 is PASS or FAIL | AC-005 |
| Input boundary | Stop hook fires with stop_hook_active true on input payload | silent (exit 0, no stdout) | AC-010 |
| Input boundary | Stop hook fires with harness_state missing | silent | AC-010 |
| Input boundary | Stop hook fires with harness_state malformed (truncated JSON) | silent; log line in `.claude/state/logs/harness_continuation.log` | AC-010 |
| Input boundary | Stop hook fires with state yielded | silent | AC-002, AC-010 |
| Input boundary | Stop hook fires with state continue but written_at older than continue_window_seconds | silent | AC-010 |
| Input boundary | Stop hook fires with state continue and tick_count at or above max_ticks_per_session | silent plus warning log line | AC-010 |
| Contract violation | harness frontmatter contains `disable-model-invocation: true` after refactor | test asserts absence | AC-003 |
| Contract violation | any post-refactor parent skill contains `Skill(verify)` text | test asserts absence | AC-005 |
| Concurrency / ordering | Two harness ticks in the same turn: first writes continue state; Stop hook fires; second tick reads same state file | second tick reads the LATEST harness_state (the second write overwrites the first) | AC-001 |
| Failure mode | harness_state write fails (simulated read-only filesystem) | phase skill surfaces error to user; harness does NOT write a stale state; turn ends; user re-invokes /harness manually | AC-001 (negative case) |
| Failure mode | verify-inline test command times out at project.json test.timeout_seconds | exit code 124 (timeout); last_test_result records FAIL with exit 124; harness writes yielded state with reason "verify FAIL needs user decision" | AC-005 plus Integrate-failure decision tree |
| Regression trap | verify_pass_guard.sh continues to read last_test_result line 1 and emit allow or block correctly | unchanged behavior; existing verify_pass_guard tests still pass | AC-005, AC-006 |
| Regression trap | consent_gate_grant.sh, spec_approval_guard.sh, swarm_approval_guard.sh, git_commit_guard.sh unchanged | byte-diff against pre-refactor versions returns no diff | AC-006 |
| Regression trap | `bash .claude/skills/audit-baseline/audit.sh` exits 0 | pass | AC-007 |
| Regression trap | end-to-end: this slug's own run produces exactly one consent-gate user prompt across the workflow | session JSONL grep | AC-001, AC-002, AC-009 |

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Log | `harness_continuation` | one line per Stop fire: `<ISO ts> harness_continuation <decision> [tick_count] [reason]` written to `.claude/state/logs/harness_continuation.log` | Audit which Stop events fired vs stayed silent; reconstruct workflow runs |
| Log | `harness` | per-tick entry to `.claude/state/harness/<slug>.log`: `<ISO ts> entered <phase>` or `completed <phase>` or `yielded at <gate>` | Track phase transitions across a workflow; visible in audit plus post-mortem |
| File state | `harness_state` | The state file itself doubles as observability: `cat .claude/state/harness_state` shows the most recent tick's decision | Live debugging during workflow runs |
| Tick counter | `harness_state.tick_count` | int per workflow run | Detect runaway loops; cap enforced at rung 5 |

There are no metrics or alarms in this design. This is in-process workflow orchestration with no production SLO. The observability surface is logs plus a state file inspectable via `cat`.

## Rollout

- **Feature flag**: none. This is an architectural refactor of an internal workflow harness; there is no user-traffic split to gate. The change ships in one commit (or one archive bundle on this non-git project).
- **Migration order**:
  1. Add `.claude/hooks/harness_continuation.sh` (new hook script).
  2. Update `.claude/settings.json` to wire the new hook in the Stop event list.
  3. Update `.claude/project.json` to add the `harness` key with default values.
  4. Update `.claude/skills/audit-baseline/audit.sh` (`EXPECTED_HOOKS` set plus comment update). **Audit-baseline begins passing.**
  5. Update `.claude/skills/harness/SKILL.md` (frontmatter flip plus SOP rewrite).
  6. Update `.claude/skills/verify/SKILL.md` (frontmatter add plus body rewrite to contract-only).
  7. Update `.claude/skills/{integrate,simplify,chore}/SKILL.md` (inline verify in each).
  8. Update `.claude/skills/tdd/SKILL.md` (thin coordinator).
  9. Update `CLAUDE.md` (Article V plus Article VIII).
  10. Update `docs/init/seed.md` (4.1 header plus table row).
  11. Update `README.md` (line near 14, line near 308).
- **Canary**: none. The first end-to-end run of the new harness is the canary, observed live during this slug's `/integrate` to `/document` to `/archive` sequence.
- **First-run validation**: the user observes auto-continuation on this slug's own integrate phase. If the Stop hook fails to fire, falls back to manual /harness re-invocation (the existing model).

## Rollback

- **Kill-switch**: revert by removing the `harness_continuation` entry from `.claude/settings.json` hooks Stop list. The Stop hook stops firing; harness reverts to user-driven re-invocation (the existing pre-refactor model). Other files can stay in the refactored state without breaking — the rest of the changes (verify inlining, tdd decomposition, frontmatter flip) function independently of the Stop hook.
- **Full rollback**: restore all 11 files listed in §Migration DDL to their pre-refactor content via the docs/archive bundle from this run (`docs/archive/<date>/harness-auto-continuation/`). Run `bash .claude/skills/audit-baseline/audit.sh` to confirm the baseline is back to the 21-hook configuration.
- **Signal to roll back**: any of the following observed within the first run after refactor:
  - Stop hook fires in a loop (tick_count cap not preventing runaway).
  - Stop hook emits `decision:block` at a consent-gate boundary (gate yield broken).
  - `audit-baseline.sh` exits non-zero post-refactor.
  - `verify_pass_guard.sh` blocks a legitimate verify write (last_test_result format mismatch).
- **Detection window**: the first full workflow run (this slug's own `/integrate` to `/archive`) is the detection window. If any of the four signals above trip, roll back before the next workflow.

## Archive plan

When this spec ships, the `archive` skill (Phase 10.5) moves the following into `docs/archive/<ship-date>/harness-auto-continuation/`. The slug-matched defaults are the standard bundle.

- Defaults *(automatic — slug-matched)*: `intake.md`, `scout.md`, `research.md`, `spec.md`, `spec-rendered/` (if `/spec-render` produced output), `security.md` (Phase 8 output).
- Extras *(non-default files)*:
  - *(none)*

## Open questions

Issues that came up during spec drafting; they DO NOT block approval but should be resolved during implementation or named as follow-ups.

- **OQ-A — `continue_window_seconds` exact default.** Research recommended 10 s. Spec confirms 10 s for the initial implementation; tunable via `project.json` harness.continue_window_seconds. If 10 s proves too tight on slow filesystems, bump to 30 s without a spec change.
- **OQ-B — `max_ticks_per_session` exact default.** Spec sets 20. A typical workflow run has around 11 phase ticks plus worker decompositions during /tdd; 20 leaves headroom. If real-world runs approach 20 routinely, revisit.
- **OQ-C — Article V exact prose.** Spec captures the contract change (auto-continuation, model-invokable harness, Stop-hook-driven advance). `/document` polishes the actual replacement paragraph; this spec does not draft the precise new sentence.
- **OQ-D — `tdd-step-6.test.mjs` post-decomposition shape.** The current test asserts `/tdd` Step 6's design-ui per-row invocation. After decomposition, the test should assert (a) `/tdd` coordinator writes the expected tdd state file given a fixture spec with design_calls_rows; (b) the harness's next tick reads it and invokes design-ui per row. Implementation refines the assertion shape; spec only commits to the decomposition contract.
- **OQ-E — `harness_state` write failure handling.** If a phase skill cannot write `harness_state` (disk full, permission denied), the skill returns normally; harness_state remains in its prior state; the Stop hook reads stale state and (because `written_at` is too old per rung 4) stays silent. The user observes the workflow paused, types `/harness` to resume manually. This is the safe degradation path. No special error handling needed inside the phase skill beyond the normal "log plus return" pattern.
- **OQ-F — README/seed.md prose mentions of "21 hooks".** Spec lists lines near 14 and 308 of `README.md` and the 4.1 header in `seed.md`. `/document` should grep for any other count references (e.g., docstrings inside src/ that mention "21 hooks") and update them in lockstep.
- **OQ-G — `harness_continuation_grace_seconds` vs `continue_window_seconds` naming.** Research used the former; spec uses the latter for parallelism with `consent.gate_marker_ttl_seconds`. Implementation may pick either; spec names the latter.
- **OQ-H — Loop detection across sessions.** If a workflow yielded mid-run and the user comes back days later, the `harness_state` written_at is stale, so the first Stop hook event sees state continue but stale written_at and stays silent. The user has to type `/harness` to resume. This is correct behavior; spec confirms it.
