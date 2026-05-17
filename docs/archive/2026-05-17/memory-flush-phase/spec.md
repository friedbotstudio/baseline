# memory-flush as workflow Phase 10.6 — end-of-workflow memory curation

<!--
Technical spec. Produced by the `spec` skill.

Guard-enforced invariants:
  - Required ## headings (artifact_template_guard):
        Goal, Design, Acceptance criteria, Test plan.
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
| Intake | `docs/intake/memory-flush-phase.md` |
| BRD *(if any)* | — |
| Scout | `docs/scout/memory-flush-phase.md` |
| Research | `docs/research/memory-flush-phase.md` |

## Goal

The harness loop runs `/memory-flush` as Phase 10.6 between `/archive` (Phase 10.5) and `/grant-commit` (Phase 11) on every workflow track (intake / spec / tdd / chore), so pending memory candidates accumulated during the workflow are triaged with full conversation context, canonical memory writes ship in the same commit as the work that motivated them, and the working tree is pristine at end-of-task.

## Non-goals

- Re-tuning the `memory_stop.sh` candidate-extraction signal threshold. Noise-floor work is a separate follow-up.
- Changing the `_pending.md` storage format or its `.gitignore` exclusion.
- Adding Phase 10.6 to `/rca` (out-of-band postmortem). `/rca` does not accumulate workflow-scoped pending state.
- Modifying `/memory-flush` Step 0–6 internal contract. The skill's curation logic stays; only its invocation context (now a workflow phase) and an empty-pending fast-path are added.
- Replacing the SessionStart hook's `MEMORY.md` index injection. The index table stays; only the "K candidates pending" prose nag changes.
- Introducing a new consent gate, new hook, new subagent, or new top-level workflow phase. The "11-phase" headline survives; 10.6 is a sub-phase like 10.5.

## Design

Diagrams are the contract. Prose is only for things a diagram cannot say.

### C4 — System context

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — baseline workflow with Phase 10.6
Person(user, "Operator", "Runs /harness, /memory-flush, /commit; types consent commands at gates")
Person(model, "Claude", "Main-context model; invokes skills via the Skill tool")
System(baseline, "Claude Code Baseline", "Constitution + 36 skills + 22 hooks + workflow state")
System_Ext(git, "Git", "Stages canonical memory writes alongside workflow output in /commit")
Rel(user, baseline, "/harness, /memory-flush, /commit")
Rel(model, baseline, "Skill(harness), Skill(memory-flush), Skill(commit)")
Rel(baseline, git, "git add + git commit", "shell")
@enduml
```

### C4 — Container

```plantuml
@startuml
!include <C4/C4_Container>
title Container — baseline pieces touched by Phase 10.6
Person(user, "Operator")
Person(model, "Claude")
System_Boundary(baseline, "Claude Code Baseline") {
  Container(constitution, "Constitution", "Markdown", "CLAUDE.md + seed.md + src/ mirrors")
  Container(skills, "Phase skills", "Skill SOPs", "harness, triage, memory-flush, commit, chore")
  Container(hooks, "Hooks", "Bash + Python", "memory_session_start, track_guard, harness_continuation")
  Container(workflow_state, "Workflow state", "JSON files under .claude/state/", "workflow.json, harness_state, .harness_active, commit_consent")
  Container(memory_state, "Memory state", "Markdown files under .claude/memory/", "_pending.md, canonical six, _resume.md")
  Container(tests, "Tests", "node --test + bash", "tests/*.mjs, .claude/skills/memory-flush/tests/run.sh")
}
Rel(user, skills, "slash commands")
Rel(model, skills, "Skill tool")
Rel(skills, workflow_state, "reads + writes")
Rel(skills, memory_state, "reads + writes")
Rel(hooks, memory_state, "reads (session-start nag)")
Rel(hooks, workflow_state, "reads (detect active workflow)")
Rel(constitution, skills, "binds (Articles III/IV/V)")
Rel(tests, skills, "asserts SOP behavior")
Rel(tests, hooks, "asserts nag behavior")
@enduml
```

### C4 — Component (changed containers only)

#### Component view: phase skills

```plantuml
@startuml
!include <C4/C4_Component>
title Component — phase skills, Phase 10.6 wiring
Container_Boundary(skills, "Phase skills") {
  Component(harness, "harness", "Skill SOP", "Loop body; picks next pending non-blocked task; invokes Skill(<phase>)")
  Component(triage, "triage", "Skill SOP", "Seeds TaskList; inserts memory-flush task between archive and grant-commit")
  Component(memflush, "memory-flush", "Skill SOP + sweep.py", "Curates pending; Step 0 sweeps canonical; fast-path on empty pending")
  Component(commit, "commit", "Skill SOP", "Prereq: archive AND memory-flush in completed")
  Component(chore, "chore", "Skill SOP", "Step 6.5 invokes Skill(memory-flush) between archive and harness_state write")
  Component(archive, "archive", "Skill SOP", "Phase 10.5 — moves slug artifacts; unchanged by this spec")
}
Rel(harness, memflush, "Skill(memory-flush) at Phase 10.6")
Rel(triage, memflush, "seeds Run /memory-flush task in TaskList")
Rel(chore, memflush, "Skill(memory-flush) at Step 6.5")
Rel(harness, archive, "Skill(archive) at Phase 10.5")
Rel(harness, commit, "Skill(commit) at Phase 11 after gate C")
Rel(commit, memflush, "reads workflow.json.completed; refuses without memory-flush")
@enduml
```

#### Component view: memory-flush internals

```plantuml
@startuml
!include <C4/C4_Component>
title Component — memory-flush SOP after Phase 10.6 wiring
Container_Boundary(memflush, "memory-flush skill") {
  Component(step0a, "Step 0a: auto-close", "sweep.py --mode auto-close", "Deletes pending-questions entries with resolved-at:")
  Component(step0b, "Step 0b: prose-scan", "sweep.py --mode prose-scan", "Surfaces prose-resolution blocks for user confirm")
  Component(step0c, "Step 0c: stale-sweep", "sweep.py --mode stale-sweep", "Re-verify / delete / mark-closed for stale entries")
  Component(fastpath, "NEW: empty-pending fast-path", "skill prose check", "Reads _pending.md; on zero CANDIDATE blocks, skip Steps 1-5")
  Component(steps1_5, "Steps 1-5: full triage", "Promote / Discard / Defer + write canonical + reset pending", "Runs when pending non-empty")
  Component(step6, "Step 6: report", "Terminal summary", "Closed/Stale/Promoted/Discarded/Deferred counts")
}
Rel(fastpath, step0a, "runs before short-circuit")
Rel(fastpath, step0b, "runs before short-circuit")
Rel(fastpath, step0c, "runs before short-circuit")
Rel(fastpath, step6, "short-circuit: one-line report")
Rel(fastpath, steps1_5, "non-empty: enter full triage")
Rel(steps1_5, step6, "full report")
@enduml
```

### Data model — class diagram

```plantuml
@startuml
title Data model — workflow + memory state schema
class WorkflowState {
  +request: string
  +slug: string
  +entry_phase: enum {intake, spec, tdd, chore}
  +exceptions: string[]
  +completed: string[] <<changed>>
  +created_at: epoch
  +updated_at: epoch
}
note right of WorkflowState
  completed now accepts "memory-flush"
  as a valid phase identifier.
end note

class HarnessState {
  +state: enum {continue, yielded, done}
  +slug: string
  +reason: string
}

class PendingMemory {
  +frontmatter: header (gitignored body below)
  +candidates: CandidateBlock[] <<existing>>
}

class CandidateBlock {
  +key: string
  +target_file: enum {landmarks, libraries, decisions, landmines, conventions, pending-questions}
  +fields: map<string,string>
}

class PendingQuestion {
  +key: Q-NNN
  +body: string
  +verified_at: short_sha | "HEAD"
  +last_touched: ISO date
  +resolved_at: ISO date <<closure>>
}
note right of PendingQuestion
  resolved-at field triggers
  sweep.py auto-close deletion
  on next /memory-flush.
end note

WorkflowState "1" -- "many" CandidateBlock : "triaged by Phase 10.6"
PendingMemory "1" *-- "many" CandidateBlock
PendingQuestion --|> CandidateBlock : "specialization for pending-questions.md entries"
@enduml
```

#### Migration DDL

```sql
-- forward (conceptual — no SQL schema; the "DDL" is data-shape changes in markdown files)

-- workflow.json's `completed` array gains "memory-flush" as a valid value.
-- No schema validator exists; consumers (harness, commit, chore) treat the array
-- as free-form append-only.

-- pending-questions.md Q-001 gains a `- resolved-at: 2026-05-17` line in its body.
-- This is data, not schema. The schema for the resolved-at field was added by
-- the memory-lifecycle-closure spec (2026-05-13, archived).

-- reverse
-- Drop "memory-flush" string from any workflow.json `completed` arrays via git
-- revert of this workflow's commit.
-- Remove the `- resolved-at: 2026-05-17` line from Q-001 via the same revert.
```

### Behavior — sequence per AC

#### §Behavior #1 — harness chains through Phase 10.6 (AC-001)

```plantuml
@startuml
title Behavior #1 — harness reaches Phase 10.6 after archive
actor Operator
participant "Skill(harness)" as H
participant "TaskList" as TL
participant "Skill(archive)" as ARC
participant "Skill(memory-flush)" as MF
database "workflow.json" as WJ
database ".harness_active" as MK
database "harness_state" as HS

Operator -> H : /harness
H -> WJ : read completed
H -> TL : pick next pending non-blocked
TL --> H : task = "Run /archive"
H -> ARC : Skill(archive)
ARC --> H : success
H -> WJ : append "archive" to completed
H -> MK : echo slug > .harness_active
H -> HS : {state:"continue", reason:"archive done; next: memory-flush"}
== next loop iteration ==
H -> TL : pick next pending non-blocked
TL --> H : task = "Run /memory-flush"
H -> MF : Skill(memory-flush)
MF --> H : success
H -> WJ : append "memory-flush" to completed
H -> MK : refresh
H -> HS : {state:"continue", reason:"memory-flush done; next: grant-commit"}
== next loop iteration ==
H -> TL : pick next pending non-blocked
TL --> H : task = "Wait for /grant-commit" (needs_user=true)
H -> MK : rm -f .harness_active
H -> HS : {state:"yielded", reason:"yielded at /grant-commit"}
H --> Operator : surface gate C
@enduml
```

#### §Behavior #2 — idempotent no-op on empty pending (AC-002)

```plantuml
@startuml
title Behavior #2 — memory-flush short-circuits on empty pending
participant "Skill(memory-flush)" as MF
database "_pending.md" as P
database "pending-questions.md" as PQ
database "five canonical files" as C5
participant "sweep.py" as SW

MF -> P : read body
P --> MF : zero `## CANDIDATE:` blocks
MF -> SW : --mode auto-close --memory-dir .claude/memory
SW -> PQ : delete entries with resolved-at:
SW -> C5 : delete entries with superseded-at:
SW --> MF : {closed: N, malformed: [], invariant_violation: []}
note right of MF
  Steps 0b (prose-scan) and 0c (stale-sweep)
  also run unconditionally — they operate on
  canonical files, not _pending.md.
end note
MF -> MF : skip Steps 1-5 (no candidates to triage)
MF -> MF : skip Step 5 pending-body reset (already empty)
MF --> MF : emit Step 6 one-line report\n"memory-flush — no pending candidates; canonical closure swept (closed N)"
@enduml
```

#### §Behavior #3 — full triage on populated pending; Q-001 auto-closes (AC-003, AC-013)

```plantuml
@startuml
title Behavior #3 — memory-flush full triage closes Q-001 via auto-close
participant "Skill(memory-flush)" as MF
database "_pending.md" as P
database "pending-questions.md" as PQ
database "canonical: landmarks/libraries/decisions/landmines/conventions" as C5
participant "sweep.py" as SW
actor Operator

MF -> SW : --mode auto-close
SW -> PQ : scan blocks for resolved-at:
PQ --> SW : Q-001 has resolved-at: 2026-05-17
SW -> PQ : delete Q-001 block
SW --> MF : {closed: 1, ...}
MF -> SW : --mode prose-scan
SW -> PQ : scan body for R1/R2/R3 regex
SW --> MF : surfaced entries (if any) → operator confirm loop
MF -> SW : --mode stale-sweep
SW --> MF : stale set (if any) → operator re-verify/delete/mark-closed loop
== full triage on _pending.md ==
MF -> P : read body
P --> MF : N candidates
loop per candidate
  MF -> MF : decide promote / discard / defer
  alt promote
    MF -> C5 : Write canonical entry with verified-at: stamp
  else defer
    MF -> PQ : append new Q-NNN entry
  end
end
MF -> P : Write skeleton-only body (reset)
MF --> Operator : Step 6 report — Closed/Promoted/Discarded/Deferred counts
@enduml
```

#### §Behavior #4 — co-located commit + pristine tree (AC-004, AC-005)

```plantuml
@startuml
title Behavior #4 — canonical writes ride workflow commit; tree clean after
participant "Skill(memory-flush)" as MF
participant "Skill(commit)" as CO
database "git working tree" as WT
database ".claude/memory/<canonical>.md (tracked)" as MC
database ".claude/memory/_pending.md (gitignored)" as MP
database "docs/archive/<date>/<slug>/ (tracked)" as ARC
actor Operator
participant Git

MF -> MC : Write canonical entries\n(promote / replace)
MF -> MP : Write skeleton-only body
note right of MP
  Per .gitignore: _pending.md is fully
  ignored. Reset never appears in diff.
end note
WT -> WT : tracked diff = canonical writes + archive bundle + workflow.json move
Operator -> CO : /commit
CO -> CO : Step 1 — git mv workflow.json → ARC
CO -> Git : git status + git diff --stat
CO -> Git : git add <named paths>
CO -> Git : git commit -m "<message>"
Git --> CO : SHA
CO --> Operator : commit SHA
Operator -> Git : git status --porcelain
Git --> Operator : (empty — pristine tree)
@enduml
```

#### §Behavior #5 — triage seeding inserts Phase 10.6 task (AC-006)

```plantuml
@startuml
title Behavior #5 — /triage seeds Run /memory-flush between archive and grant-commit
actor Operator
participant "Skill(triage)" as T
participant TaskCreate as TC
participant TaskUpdate as TU
database "workflow.json" as WJ

Operator -> T : /triage "<request>"
T -> T : decide entry_phase (intake/spec/tdd/chore)
T -> WJ : write {slug, entry_phase, exceptions, completed:[]}
== canonical TaskList seeding for intake-entry full track ==
T -> TC : Run /intake (#1)
T -> TC : Run /scout (#2)
T -> TC : Run /research (#3)
T -> TC : Run /spec (#4)
T -> TC : Wait for /approve-spec (#5, needs_user=true)
T -> TC : Run /tdd (#6)
T -> TC : Run /simplify (#7)
T -> TC : Run /security (#8)
T -> TC : Run /integrate (#9)
T -> TC : Run /document (#10)
T -> TC : Run /archive (#11)
T -> TC : Run /memory-flush (#12, metadata.phase="memory-flush")
T -> TC : Wait for /grant-commit (#13, needs_user=true)
T -> TC : Run /commit (#14)
== wire addBlockedBy chain ==
loop tasks #2 through #14
  T -> TU : addBlockedBy [previous task id]
end
T --> Operator : "next: /intake (or /harness to autopilot)"
@enduml
```

#### §Behavior #6 — SessionStart nag decision tree (AC-007, AC-008, AC-009)

```plantuml
@startuml
title Behavior #6 — memory_session_start.sh debt-mode nag
participant SessionStart as SS
participant "memory_session_start.sh" as H
database "_pending.md" as P
database "workflow.json" as WJ

SessionStart -> H : payload (source: startup|resume|clear|compact)
H -> P : count `## CANDIDATE:` blocks → K
H -> WJ : check existence → active_workflow

alt K == 0
  H -> H : (no "pending candidates" line emitted)
  note right of H
    Index table at top of additionalContext
    already shows _pending count. The prose
    line is redundant on K=0.
  end note
else K > 0 AND active_workflow absent
  H -> H : emit "**{K} candidate(s) carried over from a prior workflow** — run /memory-flush to clear before starting new work."
else K > 0 AND active_workflow present
  H -> H : (silent — Phase 10.6 will handle these)
end
H --> SessionStart : emit hookSpecificOutput.additionalContext
@enduml
```

#### §Behavior #7 — commit prereq gate (AC-011)

```plantuml
@startuml
title Behavior #7 — /commit refuses when memory-flush not in completed
actor Operator
participant "Skill(commit)" as CO
database "workflow.json" as WJ

Operator -> CO : /commit
CO -> WJ : read completed
alt memory-flush in completed OR in exceptions
  CO -> CO : proceed with Step 1 (archive workflow.json)
  CO -> CO : Step 2 verify (final non-commit entry is memory-flush)
  CO -> CO : Steps 3-7 (stage, draft, commit)
  CO --> Operator : commit SHA
else memory-flush missing AND not excepted
  CO -> CO : refuse
  CO --> Operator : "Prereq missing: memory-flush not in completed. Run /memory-flush or add to exceptions via /triage."
end
@enduml
```

### State — _pending.md lifecycle

```plantuml
@startuml
title State — _pending.md across a workflow
[*] --> Empty : workflow start (or last memory-flush)
Empty --> Populated : memory_stop appends candidate block (per turn)
Populated --> Populated : memory_stop appends more
Populated --> Empty : Skill(memory-flush) Step 5 resets to skeleton
Empty --> Empty : Skill(memory-flush) fast-path (Step 0 sweeps; Steps 1-5 skipped)
Populated --> [*] : workflow.json archived (Phase 11)
Empty --> [*] : workflow.json archived (Phase 11)
@enduml
```

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — files touched by this spec
left to right direction
[docs/init/seed.md] --> [src/seed.template.md] : "mirrored by"
[CLAUDE.md] --> [src/CLAUDE.template.md] : "mirrored by"
[docs/init/seed.md] --> [CLAUDE.md] : "governs (Art. I.4)"
[CLAUDE.md] --> [.claude/skills/harness/SKILL.md] : "Art. V binds"
[CLAUDE.md] --> [.claude/skills/triage/SKILL.md] : "Art. IV binds"
[CLAUDE.md] --> [.claude/skills/commit/SKILL.md] : "Art. IV/VII binds"
[CLAUDE.md] --> [.claude/skills/chore/SKILL.md] : "Art. IV binds"
[CLAUDE.md] --> [.claude/skills/memory-flush/SKILL.md] : "Art. IX binds"
[CLAUDE.md] --> [.claude/hooks/memory_session_start.sh] : "Art. III/IX binds"
[.claude/skills/harness/SKILL.md] --> [.claude/skills/memory-flush/SKILL.md] : "Skill tool"
[.claude/skills/chore/SKILL.md] --> [.claude/skills/memory-flush/SKILL.md] : "Skill tool"
[.claude/skills/triage/SKILL.md] --> [.claude/skills/memory-flush/SKILL.md] : "TaskList templates reference"
[.claude/skills/commit/SKILL.md] --> [.claude/state/workflow.json] : "reads completed"
[.claude/hooks/memory_session_start.sh] --> [.claude/memory/_pending.md] : "counts CANDIDATE blocks"
[.claude/hooks/memory_session_start.sh] --> [.claude/state/workflow.json] : "detects active workflow"
[.claude/skills/memory-flush/SKILL.md] --> [.claude/skills/memory-flush/sweep.py] : "Step 0 invokes"
[.claude/memory/pending-questions.md] --> [.claude/skills/memory-flush/sweep.py] : "auto-close target"
[tests/memory-flush-phase.test.mjs] --> [.claude/skills/harness/SKILL.md] : "asserts loop ordering"
[tests/memory-flush-phase.test.mjs] --> [.claude/skills/triage/SKILL.md] : "asserts TaskList seeding"
[tests/memory-flush-phase.test.mjs] --> [.claude/skills/commit/SKILL.md] : "asserts prereq gate"
[tests/memory-flush-phase.test.mjs] --> [.claude/hooks/memory_session_start.sh] : "asserts nag scenarios"
[tests/template-drift.test.mjs] --> [CLAUDE.md] : "asserts mirror"
[tests/template-drift.test.mjs] --> [docs/init/seed.md] : "asserts mirror"
[README.md] --> [CLAUDE.md] : "user-facing summary of"
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Skill | `Skill(memory-flush)` invoked as Phase 10.6 | none (skill reads `_pending.md`, canonical six, `workflow.json`) | success (after Step 0 sweep + optional Steps 1–5 + Step 6 report) | size-cap exceeded on canonical write → fail; canonical-file write IO error → fail | yes (running twice in a row produces the same end state) |
| Hook | `memory_session_start.sh` SessionStart | hook payload `.source` ∈ {startup, resume, clear, compact} | stdout JSON `{hookSpecificOutput: {hookEventName, additionalContext}}` | malformed memory files → silent (advisory only) | yes (read-only side effect of marker cleanup which is itself idempotent) |
| Skill | `Skill(commit)` (changed prereq) | `workflow.json` with `archive` AND `memory-flush` in `completed` (or in `exceptions`); `commit_consent` token fresh | commit SHA + appends `"commit"` to `completed` (moot — workflow.json archived in Step 1) | missing prereq → refusal with named gap | yes per workflow (once `commit` runs, workflow.json is gone) |
| Skill | `Skill(chore)` (changed Step 6.5) | `workflow.json` with `entry_phase: "chore"` | appends `"chore"`, `"archive"`, `"memory-flush"`, and any conditional phases to `completed` | per-step failure surfaces as harness_state yielded | no — chore is single-pass per workflow |
| Skill | `Skill(triage)` (changed TaskList templates) | request string | `workflow.json` + 14-task TaskList chain (for intake-entry, git-project, all phases) with `Run /memory-flush` between archive and grant-commit | malformed request → ask user to clarify | yes (re-run replaces or appends per existing rules) |

### Libraries and versions

No third-party libraries are introduced by this spec. The change is internal to the baseline (markdown SOPs + bash hook + mjs tests).

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| — | — | — | n/a (no library APIs in scope) |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| A | Phase 10.4 (between document and archive) — slug artifacts still at original paths | Reorders the archive-is-last convention; gains no co-located commit benefit (canonical writes don't go in the archive bundle anyway); recovery from mid-curation failure leaves a dirty `docs/<phase>/` tree |
| B | Phase 11a (after /commit) — memory writes in a separate follow-up commit | Breaks "co-located commit" property; introduces memory-debt tail; a workflow that crashes after /commit but before 11a leaves canonical drift |
| C | Chore-track conditional memory-flush (only when diff touches certain paths) | Multiplies chore's decision graph (already has 3 conditional phases); silent-skip bug surface; asymmetric with TDD/spec tracks |
| D | Harness-side empty-pending detection (skip Skill invocation) | Splits responsibility; ad-hoc `/memory-flush` invocation needs its own check anyway; Step 0 canonical sweep silently skipped (regresses memory-lifecycle-closure auto-close) |
| E | New `/q-close <Q-NNN>` slash command for inline closure | YAGNI — single-use case right now; adds command count + audit surface |
| F | Use `.harness_active` marker as active-workflow signal in the hook | Session-local; misses "user started workflow via /intake directly, never ran /harness"; inconsistent with how triage/harness/track_guard think about active workflow |

## Design calls

No UI surfaces in this spec's write_set. Verified against `project.json → tdd.ui_globs`:

- `site-src/**` — not touched.
- `app/**/*.{tsx,jsx}` — not touched.
- `components/**/*.{tsx,jsx,vue,svelte}` — not touched.
- `pages/**/*.{tsx,jsx,vue,svelte}` — not touched.
- `src/**/*.{tsx,jsx,vue,svelte}` — not touched.
- `**/*.html`, `**/*.css`, `**/*.scss`, `**/*.njk` — not touched.

Write_set: markdown (CLAUDE.md, src/CLAUDE.template.md, seed.md, src/seed.template.md, skill SOPs, intake/scout/research/spec, pending-questions.md, README.md), bash (memory_session_start.sh), and JavaScript test files (tests/*.mjs, .claude/skills/memory-flush/tests/run.sh). None of these match ui_globs.

- *(none)*

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | Given a workflow with `entry_phase=intake` (or any non-excepted entry) on a git project, when the harness loop completes `/archive`, the next pending TaskList task is `Run /memory-flush for <slug>` (blockedBy archive, blocking grant-commit) and `Skill(harness)` invokes `Skill(memory-flush)` before yielding at the grant-commit gate. | intake AC-1 | §Behavior #1 |
| AC-002 | Given a workflow where `_pending.md` body has zero `## CANDIDATE:` blocks at Phase 10.6, when `Skill(memory-flush)` is invoked, it completes with success in ≤ 3 tool-call equivalents (read pending; invoke sweep.py auto-close+prose-scan+stale-sweep; emit one-line Step 6 report), surfaces no per-candidate prompts, and `workflow.json → completed` gains `"memory-flush"`. | intake AC-2 | §Behavior #2 |
| AC-003 | Given a workflow where `_pending.md` body has N≥1 candidates at Phase 10.6, when `Skill(memory-flush)` is invoked, it executes Step 0 (auto-close + prose-scan + stale-sweep), Steps 1–5 (read canonical, decide per candidate, verify, write, reset), and Step 6 (report). At end, `_pending.md` body matches the skeleton-only shape (zero `## CANDIDATE:` blocks). | intake AC-3 | §Behavior #3 |
| AC-004 | Given a workflow that completes through `/commit`, when `git show --name-only HEAD` is run immediately after, any `.claude/memory/<canonical>.md` files modified by Phase 10.6 appear in the same commit as the workflow's primary changes. `_pending.md` body content does NOT appear in the diff (gitignored). | intake AC-4 | §Behavior #4 |
| AC-005 | Given a workflow that completes through `/commit`, when `git status --porcelain` is run immediately after, the output is empty. | intake AC-5 | §Behavior #4 |
| AC-006 | Given `/triage` for any new workflow with `entry_phase ∈ {intake, spec, tdd}` on a git project, when the TaskList is seeded, exactly one task with `metadata.phase == "memory-flush"` exists in the chain, `addBlockedBy` the `/archive` task and `addBlocks` the `Wait for /grant-commit` task. For `entry_phase == chore`, the task lives between the chore task and the grant-commit wait. | intake AC-6 | §Behavior #5 |
| AC-007 | Given a session start where `_pending.md` body has K≥1 candidates AND `.claude/state/workflow.json` is absent, when `memory_session_start.sh` fires, the emitted `additionalContext` includes a line of the form `**{K} candidate(s) carried over from a prior workflow** — run \`/memory-flush\` to clear before starting new work.` | intake AC-7 | §Behavior #6 |
| AC-008 | Given a session start where `_pending.md` body has zero candidates, when `memory_session_start.sh` fires, no "pending candidates" prose line appears in `additionalContext`. The index table at the top still shows the zero count. | intake AC-8 | §Behavior #6 |
| AC-009 | Given a session start where `_pending.md` body has K≥1 candidates AND `workflow.json` exists, when `memory_session_start.sh` fires, no "pending candidates" prose line appears in `additionalContext`. | intake AC-9 | §Behavior #6 |
| AC-010 | Given the post-change tree, when CLAUDE.md, `src/CLAUDE.template.md`, `docs/init/seed.md`, `src/seed.template.md`, `.claude/skills/harness/SKILL.md`, and `.claude/skills/triage/SKILL.md` are scanned for phase-ordering enumerations, every enumeration names `memory-flush` as Phase 10.6 between `archive` (10.5) and `commit` (11). | intake AC-10 | covered by `tests/template-drift.test.mjs` + AC-001 sequence |
| AC-011 | Given `Skill(commit)`, when invoked with `workflow.json → completed` containing `archive` but NOT `memory-flush` (and `memory-flush` not in `exceptions`), it refuses with an error naming the missing prereq. When `memory-flush` is in `completed`, it proceeds. | intake AC-11 | §Behavior #7 |
| AC-012 | Given the post-change tree, when `bash .claude/skills/audit-baseline/audit.sh` is run, exit status is 0 (PASS) with no new FAIL lines introduced relative to pre-change baseline. | intake AC-12 | covered by audit run during `/integrate` |
| AC-013 | Given the post-change tree, when `.claude/memory/pending-questions.md` is read, Q-001 is either absent (deleted by auto-close after Phase 10.6) or carries a `Resolution:` line referencing `docs/specs/memory-flush-phase.md`. | intake AC-13 | §Behavior #3 |

## Test plan

Binding test: `bash .claude/skills/audit-baseline/audit.sh` (per `project.json → test.cmd`). The audit verifies structural invariants (counts, names, hooks wired, mirrors present, citations present). Additional fixture-based tests under `tests/memory-flush-phase.test.mjs` exercise the behavioral ACs via `node --test`. The audit's PASS verdict stamps `last_test_result`; the .mjs tests run in CI via `npm test` and as part of the integrate phase.

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | Workflow runs `/triage` → `/harness`; reaches Phase 10.6 after archive; runs memory-flush; yields at grant-commit | TaskList chain has `Run /memory-flush` between archive and grant-commit; `workflow.json → completed` includes `"memory-flush"` before `commit` | AC-001, AC-006 |
| Golden path | `Skill(memory-flush)` invoked with `_pending.md` body empty | Returns success; `_pending.md` body unchanged (already empty); `workflow.json → completed` gains `"memory-flush"`; Step 6 one-line report emitted | AC-002 |
| Golden path | `Skill(memory-flush)` invoked with 3 candidate blocks in `_pending.md` | All 3 candidates decided (promote / discard / defer); `_pending.md` body reset to skeleton; canonical writes carry `verified-at:` stamp; Q-001 with `resolved-at:` deleted | AC-003, AC-013 |
| Golden path | Workflow completes through `/commit` | `git show --name-only HEAD` includes canonical memory file changes; `_pending.md` not in diff; `git status --porcelain` is empty | AC-004, AC-005 |
| Input boundary | SessionStart with K=0 candidates, no workflow.json | No "pending candidates" line in `additionalContext` | AC-008 |
| Input boundary | SessionStart with K=5 candidates, workflow.json absent | Line: `**5 candidates carried over from a prior workflow** — run \`/memory-flush\` to clear before starting new work.` | AC-007 |
| Input boundary | SessionStart with K=5 candidates, workflow.json present | No "pending candidates" line in `additionalContext` (silent) | AC-009 |
| Contract violation | `Skill(commit)` invoked with `archive` in completed but `memory-flush` absent and not excepted | Refusal with named missing prereq; no commit produced | AC-011 |
| Contract violation | `Skill(memory-flush)` Step 4 attempts to grow a canonical file past `size-cap: 500` | Skill prunes oldest unverified entries in same write OR fails the phase (per current SKILL.md constraint) | preserves existing AC from memory-flush SKILL.md |
| Concurrency / ordering | Memory-flush attempts to run before archive (e.g., bad TaskList seeding) | TaskList's `addBlockedBy` chain prevents this; harness picks lowest-id non-blocked, archive runs first | AC-001 |
| Failure mode | Canonical file write IO error during Step 4 | Phase yields with `harness_state.state: "yielded"`, `reason: "memory-flush failed: <one-line>"`; workflow.json `completed` NOT updated | preserves existing harness failure pattern |
| Regression trap | Constitution + mirror byte-equivalence after edits | `tests/template-drift.test.mjs` passes | AC-010 |
| Regression trap | `audit-baseline` exit 0 after the change | Audit reports zero FAILs | AC-012 |
| Regression trap | Phase ordering arrow chains in CLAUDE.md / harness/SKILL.md / triage/SKILL.md / README.md / seed.md mention `memory-flush` between archive and commit | grep-based assertion in `tests/memory-flush-phase.test.mjs` | AC-010 |

## Observability

The baseline has no runtime metric/log/alarm machinery; phase outcomes surface via on-disk state and the additional-context emitted at SessionStart. The "observability" entries here are the on-disk artifacts that prove correct execution.

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Log | `.claude/state/harness/<slug>.log` | `<ISO ts> entered memory-flush` / `<ISO ts> completed memory-flush` | proves Phase 10.6 fired in the loop |
| File-mutation | `.claude/state/workflow.json → completed` | array gains `"memory-flush"` | proves harness recorded the phase |
| File-mutation | `.claude/memory/_pending.md` body | shrinks to skeleton after Phase 10.6 | proves curation ran |
| Hook output | `memory_session_start.sh` additionalContext | absence or presence of debt-mode nag line | proves the three-scenario decision tree (AC-007, AC-008, AC-009) |

## Rollout

- **Feature flag**: none. Constitutional + skill-SOP changes apply atomically once the workflow's `/commit` lands.
- **Migration order**: 1. constitution edits (CLAUDE.md, seed.md, mirrors) → 2. skill SOP edits (harness, triage, memory-flush, commit, chore) → 3. hook edit (memory_session_start.sh) → 4. pending-questions.md Q-001 `resolved-at:` field → 5. new test file (tests/memory-flush-phase.test.mjs) → 6. existing test file append (.claude/skills/memory-flush/tests/run.sh) → 7. README.md line 67 update → 8. run audit + tests → PASS → 9. `/integrate` re-stamps `last_test_result` → 10. `/document` updates any user-facing docs → 11. `/archive` → 12. `/memory-flush` (Phase 10.6 self-demonstration; closes Q-001 via auto-close) → 13. `/grant-commit` → 14. `/commit`.
- **Canary**: n/a — single-operator project. The next `/triage` + `/harness` run after commit is the canary; if any phase chain misbehaves, the workflow's own logs surface it.

## Rollback

- **Kill-switch**: `git revert <commit-sha>` of this workflow's commit. Restores CLAUDE.md / seed.md / mirrors / skill SOPs / hook / Q-001 / tests / README to the pre-change state in one operation.
- **Signal to roll back**: any of (a) `tests/template-drift.test.mjs` fails on a fresh clone after the commit lands, (b) `bash .claude/skills/audit-baseline/audit.sh` exits non-zero on a fresh clone, (c) the first post-commit workflow's `/harness` loop refuses to invoke memory-flush despite the task being seeded, (d) the SessionStart hook emits the legacy "before any workflow phase work" wording instead of the debt-mode wording. Manual detection in all cases (single-operator project); no automated rollback signal. Detection window: within the operator's next `/harness` invocation, typically minutes.

## Archive plan

When this spec ships, the `archive` skill (Phase 10.5) moves the following into `docs/archive/<ship-date>/memory-flush-phase/`.

- Defaults *(automatic)*: `docs/intake/memory-flush-phase.md`, `docs/scout/memory-flush-phase.md`, `docs/research/memory-flush-phase.md`, `docs/specs/memory-flush-phase.md`, the rendered diagrams under `docs/specs/memory-flush-phase.rendered/` (if generated), `.claude/state/spec_approvals/memory-flush-phase.approval`. No swarm plan / approval (solo TDD route). No security report (security phase will run; output goes to `docs/security/memory-flush-phase-<date>.md`).
- Extras *(list any non-default files)*:
  - *(none)*

## Open questions

- None blocking approval. The research memo locked all six structural axes; the spec's three "open questions" from research are answered in this spec:
  - Test framework: `node --test` per existing `tests/*.test.mjs` pattern; no new harness.
  - Audit-baseline assertion shape: out of scope; audit count claims aren't affected, and a "memory-flush in harness/triage/chore phase chains" check would duplicate `tests/memory-flush-phase.test.mjs` AC-010 regression trap.
  - Recovery from Phase 10.6 failure: yields like any other non-integrate phase failure — `harness_state.state: "yielded"`, `reason: "memory-flush failed: <one-line summary>"`; operator investigates; re-run resumes from the failed task.
