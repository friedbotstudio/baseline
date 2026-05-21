# Spec — `.claude/workflows.jsonl` as the source of truth for workflow definitions, with amended Article IV as the meta-rule, selector-node alternates, LLM-driven classification, one-shot workflow.json migrator, and a new `/init-project doctor` sub-command

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

This is the 3rd draft. Prior drafts:
  - Draft 1 (narrow): `additions.workflow_tasks` extension to project.json.
  - Draft 2 (track-graph v1): workflows.jsonl as canonical source.
  - This draft (v2): adds selector-node alternates + preconditions, LLM-driven
    classifier with always-AskUserQuestion confirm, workflow.json migrator,
    /init-project doctor sub-command, $schema field, .claude/ tooling
    convention, and the proposed seed.md §18 + Article IV text inline.
-->

## Context

| Input | Path |
|---|---|
| Intake | `docs/intake/workflow-extension-via-workflows-json.md` (Post-intake expansion AC-009..022) |
| BRD *(if any)* | — |
| Scout *(if any)* | `docs/scout/workflow-extension-via-workflows-json.md` |
| Research *(if any)* | `docs/research/workflow-extension-via-workflows-json.md` |

### How this spec relates to its predecessors

This is the **third draft** of this spec, at the same path. The previous drafts are preserved in git history. The progression:

1. **Draft 1 (narrow):** `additions.workflow_tasks` extension to `.claude/project.json`. Rejected at the first `/approve-spec` gate when the user surfaced the full track-graph architecture (intake §Post-intake expansion, AC-009..016).
2. **Draft 2 (track-graph v1):** `.claude/workflows.jsonl` as canonical source; track-selector triage; graph-executor harness; sub-tracks; can_parallel clusters. 10 open questions raised at the second `/approve-spec` gate.
3. **This draft (v2):** resolves all 10 questions. Adds selector nodes (alternates + preconditions), LLM-driven classification, always-AskUserQuestion confirmation, one-shot workflow.json migrator, `/init-project doctor`, `$schema` field, the `.claude/` tooling convention, and inline proposed constitutional text. (Intake §Post-intake expansion AC-017..022.)

The user's framing on YAGNI is binding: *"yagni at this point is more technical debt for future."* This draft specifies the full surface — including `invocation_prompt` / `output_formatter_prompt` (declared-now, used-later) and `$schema` — rather than deferring them.

## Goal

`.claude/workflows.jsonl` is the canonical source of truth for every workflow this baseline can execute. Tracks are DAGs of nodes. Selector nodes pick among alternates based on declarative preconditions. Triage classifies the user's request via Claude reading the workflows manifest, presents the picked track + alternates via `AskUserQuestion`, and materializes the chosen track's DAG into the TaskList. Harness executes the DAG: sequential dispatch by default, `can_parallel: true` cluster dispatch for declared swarm-style work, sub-track expansion for composed orchestration. Article IV is amended to be the meta-rule binding tracks to invariants. A one-shot migrator carries forward in-flight pre-§18 `workflow.json` files. `/init-project doctor` detects and fixes baseline drift.

## Non-goals

- **No procedural removal of consent gates.** The amended Article IV preserves all consent-gate semantics (commit, push, spec approval, swarm approval). Gates remain user-typed commands; triage and harness cannot forge consent.
- **No removal of `claude-automation-recommender`'s existing `additions` shape.** project.json's `additions.{agents,skills,hooks,mcp_servers,swarm_worker_skills}` are unchanged. Workflow tasks live in `workflows.jsonl`; baseline artifact extension stays in `project.json`.
- **No new third-party library dependencies.** Schema validation is inline instructions (matching `design-ui` reads `tdd.ui_globs`, `audit-baseline.sh` reads `additions.*`). No `ajv` / `zod` / `jq`.
- **No project-defined skills beyond `additions.skills`.** A track may name any skill in `EXPECTED_SKILLS ∪ additions.skills`. Adding new skills remains a separate concern.
- **No `invocation_prompt` / `output_formatter_prompt` actuation in v1.** The fields are declared in the schema and parsed by the validator. The harness ignores them. Future v2 actuates Handlebars-style templating with LLM interpolation.
- **No runtime mutation of `workflows.jsonl` by skills.** swarm-plan writes a separate runtime overlay at `.claude/state/swarm/<slug>.jsonl`; `workflows.jsonl` is read-only at runtime.
- **No backward-compat shim for the four hardcoded triage templates.** Once `workflows.jsonl` lands, the templates in triage SKILL.md are removed; the migrated tracks ARE the templates. AC-016 binds byte-equivalence; AC-018 binds the one-shot in-flight migrator.
- **No "user can override Article IV invariants" mechanism.** Tracks SHALL satisfy the declared invariants. Workflows.jsonl is policy under a constitutional ceiling, not a constitutional bypass.
- **No JSON Schema runtime validator dependency.** Per Article VI.4 / VI.5, validation is inline. The `$schema` field is a *reference* (URL/path string) for tooling — editors that fetch the schema, future audit-baseline extensions — not a runtime dispatch table.

## Design

Diagrams are the contract. Prose is only for things a diagram cannot say.

### C4 — System context

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — workflows.jsonl-driven baseline (post-amendment)
Person(engineer, "Engineer / project owner", "edits .claude/workflows.jsonl to declare per-project tracks")
System(baseline, "Baseline (Claude Code + hooks + skills + workflows.jsonl)", "track-graph workflow executor with alternates + preconditions")
System_Ext(claudecode, "Claude Code runtime", "invokes skills via Skill tool; materializes TaskList; surfaces AskUserQuestion")
System_Ext(fs, "Filesystem", "stores workflows.jsonl, project.json, workflow.json runtime state, swarm overlay, harness log, schemas/")
System_Ext(git, "Git", "branch detection; precondition evaluation for git-bearing tracks")
Rel(engineer, baseline, "/triage <request>; /harness; /init-project [doctor]")
Rel(baseline, claudecode, "invokes skills declared in tracks; presents AskUserQuestion for track selection")
Rel(baseline, fs, "reads workflows.jsonl + project.json + schemas/; writes workflow.json + swarm overlay + log")
Rel(baseline, git, "evaluates requires_git precondition; protected-branch consent check")
@enduml
```

### C4 — Container

```plantuml
@startuml
!include <C4/C4_Container>
title Container — track-graph executor with alternates and migrator
System_Boundary(baseline, "Baseline") {
  Container(triage, "triage skill", "Markdown + Claude", "LLM-driven track selector; AskUserQuestion confirm; materializes TaskList")
  Container(harness, "harness skill", "Markdown + Claude", "graph executor: walk DAG; resolve alternates via preconditions; expand sub-tracks; dispatch can_parallel clusters; migrate pre-§18 workflow.json")
  Container(swarmplan, "swarm-plan skill", "Markdown + Claude", "writes runtime sub-track overlay to .claude/state/swarm/<slug>.jsonl")
  Container(initproject, "/init-project command", "Markdown + Claude", "seeds workflows.jsonl + schemas/ on first install")
  Container(doctor, "/init-project doctor", "Markdown + Claude", "interactive drift detector + fixer for workflows.jsonl + schemas/ + Article IV mirrors")
  Container(audit, "audit-baseline.sh", "Bash + Python3", "validates workflows.jsonl schema + Article IV invariants + four-way mirror")
  ContainerDb(workflows_jsonl, ".claude/workflows.jsonl", "JSONL file", "canonical track set (one Track per line)")
  ContainerDb(schemas_dir, ".claude/schemas/", "Directory", "JSON Schema documents referenced by Track.$schema")
  ContainerDb(project_json, ".claude/project.json", "JSON file", "per-project engineering config; additions block unchanged")
  ContainerDb(workflow_json, ".claude/state/workflow.json", "JSON file", "per-workflow runtime state: track_id, completed nodes, exceptions")
  ContainerDb(swarm_overlay, ".claude/state/swarm/<slug>.jsonl", "JSONL file", "runtime sub-track overlay; merged into workflows.jsonl view at load time")
  ContainerDb(seed_md, "docs/init/seed.md §3, §18", "Markdown", "constitutional schema declaration; .claude/ tooling convention")
  ContainerDb(claude_md, "CLAUDE.md Article IV", "Markdown", "binding invariants on every track (mirrors seed.md §18)")
}
Rel(triage, workflows_jsonl, "reads + validates; classifies user request via LLM; selects one track")
Rel(triage, schemas_dir, "dereferences Track.$schema for validation")
Rel(triage, workflow_json, "writes track_id + slug + exceptions + completed:[]")
Rel(harness, workflows_jsonl, "loads track from track_id")
Rel(harness, swarm_overlay, "loads runtime sub-track overlay if present")
Rel(harness, workflow_json, "reads + migrates pre-§18 shape; updates completed[] per node")
Rel(swarmplan, swarm_overlay, "writes sub-track entry at runtime")
Rel(initproject, workflows_jsonl, "writes canonical 4-track set on first install")
Rel(initproject, schemas_dir, "writes schema documents on first install")
Rel(doctor, workflows_jsonl, "validates + offers fixes")
Rel(doctor, schemas_dir, "validates + offers fixes")
Rel(doctor, claude_md, "checks four-way mirror integrity")
Rel(audit, workflows_jsonl, "validates schema + Article IV invariants")
Rel(audit, claude_md, "verifies Article-IV / §18 mirror")
@enduml
```

### C4 — Component (changed containers only)

Four containers change internally: triage (LLM-driven selector), harness (graph executor + migrator), swarm-plan (overlay writer), `/init-project doctor` (new).

#### Triage — LLM-driven track selector with AskUserQuestion confirm

```plantuml
@startuml
!include <C4/C4_Component>
title Component — triage skill (LLM-driven selector)
Container_Boundary(triage, "triage skill") {
  Component(load_workflows, "Step 1: Load workflows.jsonl", "instruction", "parse JSONL line-by-line; reject malformed lines with named errors citing line + schema rule")
  Component(load_overlay, "Step 2: Merge swarm overlay (if present)", "instruction", "load .claude/state/swarm/<slug>.jsonl into the same Track[] view if a prior workflow's swarm-plan emitted one")
  Component(validate_invariants, "Step 3: Validate Article IV invariants", "instruction", "I1-I11 checks: ids, skill/sub_track XOR, edge resolution, acyclicity, consent gate presence, sub_track selectability, skill resolution, gate ordering, alternates congruence, preconditions resolve")
  Component(git_detect, "Step 4: Git-repo detection", "instruction", "evaluates project-level preconditions: requires_git, etc.")
  Component(llm_classify, "Step 5: LLM-classify request", "instruction", "Claude reads each selectable Track's {track_id, name, description, selector_hints[]} and the user's natural-language request; picks the most-fitting track + ranks alternates by plausibility")
  Component(ask_user, "Step 6: AskUserQuestion (always)", "instruction", "present the picked track + top-N alternates via AskUserQuestion; user confirms or picks an alternate; never threshold-based auto-skip")
  Component(write_wf, "Step 7: Write workflow.json", "instruction", "persists track_id, slug, exceptions, entry node id, completed:[]")
  Component(materialize, "Step 8: Materialize TaskList", "instruction", "for each non-excepted node in dependency order: TaskCreate; TaskUpdate addBlockedBy")
  Component(next_step, "Step 9: Tell user next", "instruction", "names the entry node's skill or /harness")
}
Rel(load_workflows, load_overlay, "passes Track[]")
Rel(load_overlay, validate_invariants, "passes Track[] + overlay merge")
Rel(validate_invariants, git_detect, "passes")
Rel(git_detect, llm_classify, "passes precondition context")
Rel(llm_classify, ask_user, "passes picked track + ranked alternates")
Rel(ask_user, write_wf, "passes confirmed track")
Rel(write_wf, materialize, "passes")
Rel(materialize, next_step, "passes")
@enduml
```

#### Harness — graph executor + selector resolver + migrator

```plantuml
@startuml
!include <C4/C4_Component>
title Component — harness skill (graph executor + alternates + migrator)
Container_Boundary(harness, "harness skill") {
  Component(preflight, "Preflight", "instruction", "configured? resume? grounding? arm marker + harness_state")
  Component(migrate, "Workflow.json migrator (one-shot)", "instruction", "detect pre-§18 shape (entry_phase set, no track_id); derive track_id via canonical map; remap completed phase-names to node-ids; rewrite workflow.json in place")
  Component(load_track, "Load track", "instruction", "read workflow.json → track_id; load Track from workflows.jsonl + swarm overlay")
  Component(pick_next, "Pick next ready node", "instruction", "find ready set R = { n | depends_on ⊆ completed AND n ∉ completed AND n ∉ skipped_alternates }")
  Component(resolve_selector, "Resolve selector alternates", "instruction", "if node.type=selector: evaluate preconditions on each alternate in declaration order; pick first match; mark unchosen alternates as skipped")
  Component(parallel_cluster, "Detect parallel cluster", "instruction", "if multiple peers are simultaneously ready AND share can_parallel=true, group them")
  Component(dispatch_seq, "Dispatch sequential", "instruction", "Skill(<node.skill>) with input; on success update completed[]; refresh marker+state")
  Component(dispatch_par, "Dispatch parallel cluster", "instruction", "Task tool per cluster node (swarm-worker); await all; on all-success update completed[] atomically")
  Component(expand_sub, "Expand sub-track", "instruction", "TaskCreate per sub-node; rewire blockedBy at sub-track entry/exit; load sub_track from workflows.jsonl OR swarm overlay")
  Component(yield_gate, "Yield at gate", "instruction", "node.needs_user=true: marker-FIRST removal, state=yielded, surface gate command")
  Component(done, "Done", "instruction", "all reachable nodes completed: marker removal, state=done, terminal message")
}
Rel(preflight, migrate, "passes")
Rel(migrate, load_track, "passes (possibly-migrated) workflow.json")
Rel(load_track, pick_next, "passes loaded Track")
Rel(pick_next, resolve_selector, "candidate is a selector node")
Rel(pick_next, parallel_cluster, "candidate is regular node(s)")
Rel(resolve_selector, expand_sub, "chosen alternate has sub_track")
Rel(resolve_selector, dispatch_seq, "chosen alternate has skill")
Rel(parallel_cluster, dispatch_seq, "single ready node")
Rel(parallel_cluster, dispatch_par, "can_parallel cluster")
Rel(dispatch_seq, expand_sub, "if node has sub_track")
Rel(dispatch_par, expand_sub, "if any cluster node has sub_track")
Rel(dispatch_seq, pick_next, "node done; continue")
Rel(dispatch_par, pick_next, "cluster done; continue")
Rel(expand_sub, pick_next, "sub-track materialized; continue")
Rel(pick_next, yield_gate, "ready node has needs_user")
Rel(pick_next, done, "no ready nodes AND all reachable completed")
@enduml
```

### Data model — class diagram

```plantuml
@startuml
title Data model — workflows.jsonl schema (§18, v2 with alternates + selector nodes)
class WorkflowsJsonl <<file>> {
  ' line-delimited; one Track per line
  +tracks: Track[] <<derived from JSONL lines>>
}
class Track <<new>> {
  +$schema: string <<URL/path to JSON Schema document; rejected if unknown version>>
  +track_id: string <<unique across file>>
  +name: string
  +description: string <<full-paragraph; LLM reads for classification>>
  +selectable: bool <<true: triage can pick; false: sub-track only>>
  +selector_hints: string[] <<descriptive aids for the LLM classifier; NOT match tokens>>
  +preconditions: Predicate[] <<track-level: track unavailable if any fails (e.g., requires_git)>>
  +invariants: TrackInvariant[] <<declared properties: 'commits', 'requires_spec', 'requires_swarm', 'chore', 'git_only'>>
  +nodes: Node[] <<unique id within track>>
}
class Node <<new>> {
  +id: string <<unique within track>>
  +type: NodeType = "task" <<task | selector; default 'task'>>
  +skill: string? <<for type=task: XOR with sub_track>>
  +sub_track: string? <<for type=task: XOR with skill; references another Track.track_id>>
  +alternates: Alternate[] <<for type=selector: ordered list; preconditions decide which fires>>
  +input: string?
  +invocation_prompt: string? <<declared-now/used-later: Handlebars + LLM interpolation in v2>>
  +output: string?
  +output_formatter_prompt: string? <<declared-now/used-later>>
  +depends_on: string[]
  +blocks: string[]
  +can_parallel: bool = false
  +needs_user: bool = false
  +activeForm: string?
  +metadata: object?
}
class Alternate <<new>> {
  ' One option inside a selector node
  +skill: string? <<XOR with sub_track>>
  +sub_track: string? <<XOR with skill>>
  +preconditions: Predicate[] <<all must pass for this alternate to fire>>
  +description: string? <<optional rationale shown in logs and AskUserQuestion>>
}
class Predicate <<new>> {
  ' Declarative; resolved by triage / harness at evaluation time
  ' v1 vocabulary:
  '   requires_git
  '   requires_user_override:<value>      e.g., for user-forced "always solo"
  '   requires_min_components:<int>       evaluated post-spec by counting C4 components
  '   requires_phase_completed:<phase>    e.g., requires the spec phase has been approved
  '   requires_skill_present:<skill_id>   skill exists in EXPECTED_SKILLS ∪ additions.skills
  +name: string
  +argument: string? <<optional; e.g., "3" for min_components>>
}
class NodeType <<enum>> {
  task
  selector
}
class TrackInvariant <<enum>> {
  commits         ' track ends in a commit-bearing node
  requires_spec   ' track requires an approved spec
  requires_swarm  ' track uses can_parallel clusters
  chore           ' chore-track shape
  git_only        ' requires git working tree
}
class ArticleIVInvariant <<enum>> {
  ' I1: unique track_id
  ' I2: unique node.id within track
  ' I3: type=task → skill XOR sub_track; type=selector → alternates non-empty
  ' I4: depends_on/blocks resolve to ids in same track
  ' I5: DAG acyclicity
  ' I6: tracks with 'commits' invariant include needs_user 'grant-commit' node before 'commit' skill node
  ' I7: sub_track references resolve to a Track with selectable=false
  ' I8: every skill: reference resolves to EXPECTED_SKILLS ∪ additions.skills
  ' I9: needs_user nodes appear in dep order before nodes that depend on their consent token
  ' I10: selector node's alternates share the same depends_on AND blocks (interchangeable in DAG)
  ' I11: every Predicate.name resolves to a known v1 predicate
}
class WorkflowRuntimeState <<existing, changed>> {
  +request: string
  +slug: string
  +track_id: string <<v2; replaces entry_phase>>
  +exceptions: string[] <<node ids excepted (e.g., grant-commit on non-git)>>
  +completed: string[] <<node ids in completion order>>
  +skipped_alternates: string[] <<v2; tracks alternates skipped at selector nodes>>
  +source_backlog_keys: string[]
  +created_at: int
  +updated_at: int
}
WorkflowsJsonl "1" *-- "many" Track
Track "1" *-- "many" Node
Node "1" *-- "many" Alternate : (only when type=selector)
Alternate "1" *-- "many" Predicate
Track ..> Predicate : preconditions[]
Track ..> TrackInvariant : invariants[]
Track ..> ArticleIVInvariant : must satisfy
Node "0..1" --> Track : sub_track ref
Alternate "0..1" --> Track : sub_track ref
WorkflowRuntimeState ..> Track : track_id resolves to
@enduml
```

#### Schema migration

The "migration" is the new schema declaration in `seed.md §18` + Article IV amendment + new files. The class diagram above is the schema; the file's initial content is the migrated 4-track canonical set.

```sql
-- forward
-- 1. Declare schema in docs/init/seed.md §18 + mirror to src/seed.template.md.
-- 2. Add .claude/ tooling convention to docs/init/seed.md §3 (Directory structure) + mirror.
-- 3. Amend CLAUDE.md Article IV + mirror to src/CLAUDE.template.md.
-- 4. Add NEW DIRECTORY .claude/schemas/ with workflow-track.v1.json (JSON Schema document referenced by Track.$schema).
-- 5. Add NEW FILE .claude/workflows.jsonl with the migrated canonical track set:
--    Line 1: track_id="intake-full"           — canonical 11-phase pipeline; selector node at Phase 6 with [swarm, tdd] alternates
--    Line 2: track_id="spec-entry"            — bugfix-with-spec pipeline
--    Line 3: track_id="tdd-quickfix"          — quickfix pipeline (no spec)
--    Line 4: track_id="chore"                 — chore pipeline
--    Line 5: track_id="swarm-implementation"  — sub-track (selectable=false); {swarm-plan → approve-swarm → swarm-dispatch}; preconditions: requires_git, requires_min_components:3
--    Line 6: track_id="tdd-worker-chain"      — sub-track (selectable=false); {tdd} (with internal worker chain)
-- 6. Add NEW FILE src/.claude/workflows.template.jsonl (pristine 4 selectable + 2 sub).
-- 7. Add NEW FILE src/.claude/schemas/workflow-track.v1.json (pristine schema).
-- 8. Add .claude/workflows.jsonl, .claude/schemas/, .claude/state/swarm/*.jsonl to NEVER_TOUCH lists in src/cli/install.js + scripts/build-manifest.mjs.
-- 9. Modify .claude/skills/triage/SKILL.md: rewrite to be the LLM-driven selector (Component diagram above).
-- 10. Modify .claude/skills/harness/SKILL.md: rewrite to be the graph executor + migrator (Component diagram above).
-- 11. Modify .claude/skills/swarm-plan/SKILL.md: write runtime overlay to .claude/state/swarm/<slug>.jsonl.
-- 12. Modify .claude/commands/init-project.md: add Step 6.X for seeding workflows.jsonl + schemas/.
-- 13. Add NEW COMMAND .claude/commands/init-project-doctor.md (the /init-project doctor sub-command).
-- 14. Modify .claude/skills/audit-baseline/audit.sh: validate workflows.jsonl + four-way mirror.
-- 15. This repo's .claude/workflows.jsonl gets a cli-copy-review node in intake-full and tdd-quickfix tracks (between memory-flush and grant-commit).
-- 16. Update tests under tests/ per the Test plan section.

-- reverse
-- Single commit revert. Removes all new files; reverts skills.
-- In-flight workflow.json files written under the new shape are forward-incompatible after revert.
-- The one-shot migrator (AC-018) is forward-direction-only by design; a reverse migrator is YAGNI for the single-commit-revert path.
```

`.claude/workflows.jsonl` is `NEVER_TOUCH`. `.claude/schemas/` is `NEVER_TOUCH` at the directory level (a small generalization to NEVER_TOUCH semantics — currently it's exact-path; this work introduces glob-or-prefix matching in `install.js` and `build-manifest.mjs` to handle directories).

#### Proposed `docs/init/seed.md` §18 text (verbatim for the reviewer)

The full proposed text is too long to inline here verbatim; what follows is the structural skeleton the spec binds the TDD phase to write:

```markdown
## §18 — Workflow definitions and Article IV invariants

### 17.1 Source of truth
`.claude/workflows.jsonl` is the canonical source for every workflow this baseline can execute. One Track per line. The file is project-owned and NEVER_TOUCH.

### 17.2 Track schema (referenced by Track.$schema)
[Track record shape: $schema, track_id, name, description, selectable, selector_hints[], preconditions[], invariants[], nodes[]]
[Node record shape: id, type, skill, sub_track, alternates[], input, invocation_prompt, output, output_formatter_prompt, depends_on[], blocks[], can_parallel, needs_user, activeForm, metadata]
[Alternate record shape: skill, sub_track, preconditions[], description]
[Predicate record shape: name, argument]

### 17.3 Article IV invariants (I1..I11)
[I1-I11 verbatim per the class diagram]

### 17.4 Predicate vocabulary (v1)
- requires_git
- requires_user_override:<value>
- requires_min_components:<int>
- requires_phase_completed:<phase>
- requires_skill_present:<skill_id>

### 17.5 invocation_prompt / output_formatter_prompt — declared, deferred
Fields are part of the v1 schema; harness ignores them. v2 will actuate via Handlebars + LLM interpolation.

### 17.6 Migration from pre-§18 workflow.json
[Canonical entry_phase → track_id map + node-id remap rules]
```

#### Proposed `CLAUDE.md` Article IV text (verbatim for the reviewer)

Article IV is replaced wholesale. The new version is approximately:

```markdown
## Article IV — Workflow definition and invariants (MANDATORY)

`.claude/workflows.jsonl` is the source of truth for every workflow this baseline can execute. Tracks declared therein bind via the invariants below. Triage and harness ARE actuators of those tracks. The phase ordering rules previously embedded in this Article live now in the canonical Track records in workflows.jsonl.

### Invariants every Track SHALL satisfy
I1 — Unique track_id across workflows.jsonl.
I2 — Unique node.id within a track.
I3 — type=task nodes carry exactly one of {skill, sub_track}. type=selector nodes carry non-empty alternates[].
I4 — All depends_on / blocks references resolve to node ids in the same track.
I5 — The dependency DAG is acyclic.
I6 — Tracks with the 'commits' invariant SHALL include a needs_user 'grant-commit' node ordered in the DAG before the node whose skill is 'commit'.
I7 — sub_track references SHALL resolve to a Track with selectable=false.
I8 — Every skill: reference SHALL resolve to a skill in EXPECTED_SKILLS ∪ project.json additions.skills.
I9 — needs_user=true nodes SHALL appear in dependency order before any node that depends on their consent token.
I10 — A selector node's alternates SHALL share identical depends_on and blocks lists (interchangeable in the DAG).
I11 — Every Predicate.name SHALL resolve to a known v1 predicate.

### Constitutional precedence (extends Article I)
- `seed.md §18` declares the schema, invariants, and predicate vocabulary.
- `CLAUDE.md` Article IV (this Article) binds the invariants on every Track.
- `.claude/workflows.jsonl` IS the policy — every project owns its own.
- Triage and harness SHALL NOT carry hardcoded track templates.

### Validation
At three points: install/upgrade (workflows.jsonl + schemas/); triage time (selected track); harness time (per-node).

### git-conditional behavior
Tracks declaring 'git_only' or whose preconditions include 'requires_git' are unavailable on non-git projects. The LLM classifier excludes them; the user is not offered them via AskUserQuestion.

### Consent gates
needs_user=true nodes correspond to consent commands typed by the user (e.g., /approve-spec, /grant-commit). Claude SHALL NOT forge consent. Gate semantics are unchanged from the previous Article IV.
```

### Behavior — sequence per AC

#### §Behavior #1 — LLM-driven track selection with AskUserQuestion confirm

Covers `SP-001` (AC-009) + `SP-013` (AC-021).

```plantuml
@startuml
title Behavior #1 — triage classifies via LLM, confirms via AskUserQuestion
actor User
participant TriageSkill as "triage (Claude)"
database "workflows.jsonl" as WJ
database "swarm overlay (if any)" as SO
database "schemas/" as SCH
database "workflow.json" as WF
participant AskUserQuestion as "AskUserQuestion tool"
participant TaskCreate

User -> TriageSkill : /triage "<request>"
TriageSkill -> WJ : read each line
TriageSkill -> SO : read overlay (if present)
TriageSkill -> SCH : dereference each Track.$schema
TriageSkill -> TriageSkill : validate every Track against §18 (I1-I11)
alt invariant violation
  TriageSkill -> User : ERROR: "track <id>: invariant I<N> failed: <message>"
  note right : halt; no workflow.json written
end

TriageSkill -> TriageSkill : Step 4 — evaluate project-level preconditions\n(requires_git, etc.) → set of available tracks
TriageSkill -> TriageSkill : Step 5 — LLM classify\nfor each available Track: read name, description, selector_hints[]\nmatch against user request via natural-language reasoning\nrank by plausibility
TriageSkill -> AskUserQuestion : "Picked track <X>. Alternates considered: <Y>, <Z>. Proceed with <X>?"
note right : ALWAYS present via AskUserQuestion;\nnever skip based on confidence threshold

alt user picks the suggested track
  AskUserQuestion --> TriageSkill : track <X>
else user picks an alternate
  AskUserQuestion --> TriageSkill : track <Y>
else user escapes/clarifies
  AskUserQuestion --> TriageSkill : <free-form>
  TriageSkill -> User : clarifying follow-up; re-classify
end

TriageSkill -> WF : write {request, slug, track_id, exceptions, completed:[], skipped_alternates:[], ...}
TriageSkill -> TaskCreate : per node (in dependency order)
TriageSkill -> User : "Workflow seeded for track <id>. Next: <entry-node-skill> or /harness."
@enduml
```

#### §Behavior #2 — Graph execution: sequential + parallel-cluster dispatch

Covers `SP-002` (AC-010).

```plantuml
@startuml
title Behavior #2 — harness graph execution (sequential + parallel cluster)
participant HarnessSkill
database "workflow.json" as WF
database "workflows.jsonl + overlay" as WJ
participant SkillTool as "Skill / Task tool"

HarnessSkill -> WF : read track_id + completed[] + skipped_alternates[]
HarnessSkill -> WJ : load Track(track_id) + overlay sub-tracks
WJ --> HarnessSkill : Track with N nodes

loop until graph exits
  HarnessSkill -> HarnessSkill : compute ready set R = { n | n.depends_on ⊆ completed AND n ∉ completed AND n ∉ skipped_alternates }
  alt R is empty AND no in-flight cluster
    note right : graph done\nexit loop with state=done
  else any node in R has needs_user=true
    note right : exit loop with state=yielded
  else multiple nodes in R share can_parallel=true
    HarnessSkill -> SkillTool : Task tool per node in parallel (swarm-worker)
    SkillTool --> HarnessSkill : per-node JSON status
    HarnessSkill -> HarnessSkill : on all-success: completed += cluster\non any failure: yield
  else single ready node OR mixed can_parallel
    HarnessSkill -> SkillTool : Skill(<node.skill>) with input
    SkillTool --> HarnessSkill : success / error
    HarnessSkill -> HarnessSkill : update completed; refresh marker+state
  end
end
@enduml
```

#### §Behavior #3 — Sub-track expansion

Covers `SP-003` (AC-011).

```plantuml
@startuml
title Behavior #3 — sub-track expansion
participant HarnessSkill
database "workflows.jsonl + overlay" as WJ
participant TaskCreate
participant TaskUpdate

HarnessSkill -> HarnessSkill : pick ready node N with sub_track="tdd-worker-chain"
HarnessSkill -> WJ : load Track("tdd-worker-chain")
WJ --> HarnessSkill : SubTrack with M nodes

loop each sub-node in dep order
  HarnessSkill -> TaskCreate : subject, activeForm, metadata.parent_node=N.id
end

== rewire blockedBy ==

HarnessSkill -> TaskUpdate : sub-track entry blockedBy = N.depends_on's task ids
HarnessSkill -> TaskUpdate : original successors (nodes with N.id in depends_on) addBlockedBy = sub-track exit
HarnessSkill -> TaskUpdate : N → completed (wrapper)

note right : sub-track DAG slots into the parent track's DAG;\nblockedBy edges preserved at the boundary
@enduml
```

#### §Behavior #4 — Selector node resolution via preconditions

Covers `SP-014` (AC-017).

```plantuml
@startuml
title Behavior #4 — selector node picks an alternate by preconditions
participant HarnessSkill
database "workflow.json" as WF
database "workflows.jsonl + overlay" as WJ

HarnessSkill -> WJ : load Track('intake-full')
note right : intake-full has a selector node 'implementation'\nwith alternates:\n  [swarm-implementation (preconditions: requires_git, requires_min_components:3),\n   tdd-worker-chain     (preconditions: empty)]

HarnessSkill -> HarnessSkill : pick ready node 'implementation' (type=selector)

== evaluate alternates in order ==

loop each alternate in declaration order
  HarnessSkill -> HarnessSkill : check preconditions[] (run predicate by name)
  alt all preconditions pass
    note right : chosen alternate found; break
  else any precondition fails
    note right : try next alternate
  end
end

alt no alternate passes
  HarnessSkill -> HarnessSkill : YIELD with named error\n"selector 'implementation': no alternate satisfies preconditions"
end

== expand chosen alternate ==

alt chosen.skill is set
  HarnessSkill -> HarnessSkill : invoke chosen.skill directly (like a task node)
else chosen.sub_track is set
  HarnessSkill -> HarnessSkill : expand the sub-track (Behavior #3 path)
end

HarnessSkill -> WF : skipped_alternates += unchosen alternate ids
HarnessSkill -> WF : completed += 'implementation' (selector itself wraps; replaced by the chosen alternate's work)
@enduml
```

#### §Behavior #5 — Validation failures (schema + invariants)

Covers `SP-004` (AC-012), `SP-005` (AC-013), `SP-006` (AC-014), `SP-015` (AC-022).

```plantuml
@startuml
title Behavior #5 — workflows.jsonl validation failures
actor User
participant TriageSkill
database "workflows.jsonl" as WJ
database "schemas/" as SCH

User -> TriageSkill : /triage "<request>"
TriageSkill -> WJ : read file
TriageSkill -> SCH : dereference each Track.$schema

alt JSONL parse failure (line K)
  TriageSkill -> User : ERROR: "workflows.jsonl line K: parse failed at column C"
else Track.$schema references unknown version (AC-022)
  TriageSkill -> User : ERROR: "track <id>: $schema='<URL>' unknown. Supported: workflow-track.v1.json. Run /init-project doctor to upgrade."
else schema validation fails (field missing, wrong type, unknown field)
  TriageSkill -> User : ERROR: "track <id>, line K: schema violation: <message>"
else invariant I6 (commit track lacks grant-commit gate)
  TriageSkill -> User : ERROR: "track <id> declares 'commits' invariant but has no needs_user 'grant-commit' node before commit. See Article IV invariant I6."
else invariant I8 (skill does not resolve)
  TriageSkill -> User : ERROR: "track <id>, node <node_id>: skill='<X>' does not exist. Declare in project.json additions.skills or remove the node."
else invariant I10 (alternates have divergent depends_on/blocks)
  TriageSkill -> User : ERROR: "selector node <id>: alternate <A> depends_on differs from alternate <B>. Article IV invariant I10."
else invariant I11 (unknown predicate)
  TriageSkill -> User : ERROR: "track <id>, predicate '<name>': not in v1 vocabulary. See seed.md §18.4."
else any other invariant (I1-I5, I7, I9)
  TriageSkill -> User : ERROR: "track <id>: invariant I<N> violated: <specific message>"
end

note right : workflow.json is NOT written;\nuser fixes config or runs /init-project doctor;\nre-runs /triage
@enduml
```

#### §Behavior #6 — Pre-§18 workflow.json migrator

Covers `SP-016` (AC-018).

```plantuml
@startuml
title Behavior #6 — one-shot in-flight workflow.json migrator
actor User
participant HarnessSkill
database "workflow.json (pre-§18)" as WfOld
database "workflow.json (post-§18)" as WfNew

User -> HarnessSkill : /harness (post-§18 baseline; pre-§18 workflow.json on disk)
HarnessSkill -> WfOld : read

alt workflow.json has 'entry_phase' field, no 'track_id'
  HarnessSkill -> HarnessSkill : detect pre-§18 shape; enter migrator

  HarnessSkill -> HarnessSkill : derive track_id via canonical map:\n  intake → intake-full\n  spec   → spec-entry\n  tdd    → tdd-quickfix\n  chore  → chore

  HarnessSkill -> HarnessSkill : remap completed phase-names → node-ids\n(node ids are the phase names in canonical tracks, so this is mostly identity)\n(exception: selector-node phases like 'implementation' need name → node-id mapping)

  HarnessSkill -> WfNew : write new shape:\n  track_id=<derived>\n  completed=<remapped node ids>\n  skipped_alternates=[]\n  exceptions=<carry over verbatim>

  HarnessSkill -> HarnessSkill : log "migrated workflow.json from pre-§18 shape"
else workflow.json already has track_id (post-§18 shape)
  HarnessSkill -> HarnessSkill : skip migrator; proceed
end

HarnessSkill -> WfNew : continue normal harness flow
@enduml
```

#### §Behavior #7 — `/init-project doctor` detects and fixes drift

Covers `SP-017` (AC-019), `SP-018` (AC-020).

```plantuml
@startuml
title Behavior #7 — /init-project doctor: drift detection + interactive fix
actor User
participant DoctorCmd as "/init-project doctor"
database "workflows.jsonl" as WJ
database "schemas/" as SCH
database "seed.md §18" as Seed
database "CLAUDE.md Article IV" as Claude
database "src templates" as Src
participant AskUserQuestion

User -> DoctorCmd : /init-project doctor

== check 1: workflows.jsonl present ==

DoctorCmd -> WJ : exists?
alt absent
  DoctorCmd -> AskUserQuestion : "workflows.jsonl missing. Restore from template?"
  AskUserQuestion --> DoctorCmd : Restore | Skip | Manual
  alt Restore
    DoctorCmd -> WJ : copy from src/.claude/workflows.template.jsonl
  end
end

== check 2: schemas/ present ==

DoctorCmd -> SCH : exists + workflow-track.v1.json present?
alt absent
  DoctorCmd -> AskUserQuestion : "schemas/ directory missing. Restore from template?"
  AskUserQuestion --> DoctorCmd : Restore | Skip
  alt Restore
    DoctorCmd -> SCH : copy from src/.claude/schemas/
  end
end

== check 3: schema + invariant validation ==

DoctorCmd -> DoctorCmd : validate workflows.jsonl per §18 (I1..I11)
loop each violation found
  DoctorCmd -> AskUserQuestion : "Violation: <I<N>>: <message>. Action: <suggested fix>?"
  AskUserQuestion --> DoctorCmd : Apply | Skip | Show diff
  alt Apply
    DoctorCmd -> WJ : write corrected content
  end
end

== check 4: Article IV / §18 four-way mirror ==

DoctorCmd -> Seed : load §18
DoctorCmd -> Claude : load Article IV
DoctorCmd -> Src : load src/seed.template.md §18 + src/CLAUDE.template.md Article IV
alt mirror drift between any pair
  DoctorCmd -> AskUserQuestion : "Mirror drift: <pair>. Action: re-mirror?"
  AskUserQuestion --> DoctorCmd : Apply | Skip
end

== check 5: .claude/ tooling convention (AC-020) ==

DoctorCmd -> DoctorCmd : scan project root for shipped tooling files\nthat should live under .claude/
loop each violation
  DoctorCmd -> AskUserQuestion : "Convention violation: <file>. Move to .claude/?"
end

DoctorCmd -> User : "Doctor complete. Fixed: <N>. Skipped: <M>. Remaining manual: <K>."
@enduml
```

#### §Behavior #8 — Install + upgrade lifecycle

Covers `SP-011` (AC-007), `SP-012` (AC-008).

```plantuml
@startuml
title Behavior #8 — .claude/workflows.jsonl + schemas/ install + upgrade
actor User
participant CLI as "create-baseline CLI"
participant InstallJs
participant MergeJs
database TemplateRoot as "obj/template/.claude/"
database ProjectRoot as "<target>/.claude/"

== fresh install ==

User -> CLI : npx create-baseline ./new-target
CLI -> InstallJs : freshInstall(...)
InstallJs -> TemplateRoot : read workflows.jsonl + schemas/
InstallJs -> ProjectRoot : write workflows.jsonl + schemas/
note right : both ship pristine; user customizes later

== upgrade (both are NEVER_TOUCH) ==

User -> CLI : create-baseline upgrade ./target
CLI -> MergeJs : threeWayMerge(...)

loop each NEVER_TOUCH path/glob
  MergeJs -> ProjectRoot : exists?
  alt present
    MergeJs -> CLI : NEVER_TOUCH_PRESERVE
  else absent
    MergeJs -> ProjectRoot : write from template (NEVER_TOUCH_ADD)
  end
end

note right : the NEVER_TOUCH list grows to include\n  .claude/workflows.jsonl (exact path),\n  .claude/schemas/ (directory glob)\nwhich requires a small generalization to NEVER_TOUCH semantics
@enduml
```

#### §Behavior #9 — Byte-equivalent migration + cli-copy-review retrofit

Covers `SP-008` (AC-016), `SP-009` (AC-002).

```plantuml
@startuml
title Behavior #9 — byte-equivalent migration + cli-copy-review dogfood
participant Test
participant TriagePre as "pre-§18 triage"
participant TriagePost as "post-§18 triage"
database "workflows.jsonl" as WJ

== byte-equivalence (AC-016) ==

Test -> TriagePre : /triage <request> (hardcoded templates)
TriagePre --> Test : TaskList₁

Test -> TriagePost : /triage <request> (workflows.jsonl-driven)
TriagePost -> WJ : load tracks
TriagePost --> Test : TaskList₂

Test -> Test : assert TaskList₁ == TaskList₂\n(modulo selector-node nodes whose name is internal\n— e.g., 'implementation' wraps tdd or swarm)
alt mismatch
  Test -> Test : FAIL
end

== cli-copy-review retrofit (AC-002) ==

note over WJ : this repo's workflows.jsonl declares a 'cli-copy-review' node\nin the intake-full and tdd-quickfix tracks\n(positioned between memory-flush and grant-commit)

Test -> TriagePost : /triage <CLI-touching request>
TriagePost --> Test : TaskList includes cli-copy-review at the declared position
Test -> Test : assert grep -rn "cli-copy-review" .claude/skills/triage/SKILL.md → 0 lines
Test -> Test : assert grep cli-copy-review .claude/workflows.jsonl → 2 occurrences (one per track)
@enduml
```

#### §Behavior #10 — Article IV mirror + audit-baseline

Covers `SP-007` (AC-015), `SP-010` (AC-006).

```plantuml
@startuml
title Behavior #10 — Article IV four-way mirror + audit
actor User
participant Audit as "audit-baseline.sh"
database "docs/init/seed.md §18" as Seed
database "CLAUDE.md Article IV" as Claude
database "src/seed.template.md" as SrcSeed
database "src/CLAUDE.template.md" as SrcClaude
database "workflows.jsonl" as WJ

User -> Audit : bash audit-baseline.sh
Audit -> Seed : extract §18 schema + invariant text
Audit -> Claude : extract Article IV
Audit -> SrcSeed : extract §18 (template mirror)
Audit -> SrcClaude : extract Article IV (template mirror)

alt seed.md §18 ≠ src/seed.template.md §18
  Audit -> User : FAIL: "mirror drift: seed.md §18"
else CLAUDE.md Article IV ≠ src/CLAUDE.template.md Article IV
  Audit -> User : FAIL: "mirror drift: CLAUDE.md Article IV"
else Article IV invariant text ≠ §18 invariant block (cross-doc)
  Audit -> User : FAIL: "cross-doc drift: Article IV invariants must match seed.md §18 (per Article I.4)"
end

Audit -> WJ : validate every track against §18 + I1..I11
alt any track fails
  Audit -> User : FAIL: "track <id>: invariant I<N>"
end

Audit -> User : PASS (exit 0)
@enduml
```

### State — core entity

```plantuml
@startuml
title State — workflow runtime (post-§18)
[*] --> not_started : /triage creates workflow.json (post-§18 shape)
[*] --> pre_seventeen : pre-§18 workflow.json found on disk
pre_seventeen --> not_started : harness's one-shot migrator (Behavior #6)
not_started --> in_progress : harness loop begins
in_progress --> in_progress : node completes; completed[] grows
in_progress --> in_progress : selector resolved; skipped_alternates[] grows
in_progress --> yielded : node.needs_user OR phase-failure OR selector-no-match
yielded --> in_progress : user fires consent command OR /harness re-invoked
in_progress --> done : all reachable nodes completed
done --> [*]
yielded --> aborted : user aborts (re-/triage or manual delete)
aborted --> [*]
@enduml
```

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — workflows.jsonl architecture (v2)
left to right direction
[seed.md §3 .claude convention] --> [src/seed.template.md §3]
[seed.md §18] --> [src/seed.template.md §18]
[seed.md §18] --> [CLAUDE.md Article IV]
[CLAUDE.md Article IV] --> [src/CLAUDE.template.md Article IV]
[workflows.jsonl schema] --> [seed.md §18]
[.claude/schemas/workflow-track.v1.json] --> [workflows.jsonl schema]
[.claude/workflows.jsonl] --> [workflows.jsonl schema]
[.claude/workflows.jsonl] --> [.claude/schemas/workflow-track.v1.json]
[src/.claude/workflows.template.jsonl] --> [workflows.jsonl schema]
[src/.claude/schemas/] --> [workflows.jsonl schema]
[triage SKILL.md] --> [.claude/workflows.jsonl]
[triage SKILL.md] --> [CLAUDE.md Article IV]
[harness SKILL.md] --> [.claude/workflows.jsonl]
[harness SKILL.md] --> [.claude/state/workflow.json]
[harness SKILL.md] --> [.claude/state/swarm/<slug>.jsonl]
[harness SKILL.md] --> [triage SKILL.md]
[swarm-plan SKILL.md] --> [workflows.jsonl schema]
[swarm-plan SKILL.md] --> [.claude/state/swarm/<slug>.jsonl]
[init-project] --> [src/.claude/workflows.template.jsonl]
[init-project] --> [src/.claude/schemas/]
[init-project-doctor command] --> [.claude/workflows.jsonl]
[init-project-doctor command] --> [.claude/schemas/]
[init-project-doctor command] --> [CLAUDE.md Article IV]
[install.js NEVER_TOUCH] --> [.claude/workflows.jsonl]
[install.js NEVER_TOUCH] --> [.claude/schemas/]
[build-manifest.mjs NEVER_TOUCH_PATHS] --> [.claude/workflows.jsonl]
[audit-baseline.sh] --> [CLAUDE.md Article IV]
[audit-baseline.sh] --> [.claude/workflows.jsonl]
[audit-baseline.sh] --> [seed.md §18]
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Config schema | `.claude/workflows.jsonl` | JSONL file | Track[] | parse / schema / invariant violations halt | yes |
| Track | one JSONL line | `{$schema, track_id, name, description, selectable, selector_hints[], preconditions[], invariants[], nodes[]}` | seedable when selectable + preconditions pass | I1-I11 | yes |
| Node | `Node` record | `{id, type, skill?, sub_track?, alternates?, ...}` | one TaskCreate (or selector resolution) | I3, I4, I8, I10, I11 | yes |
| Selector node | `Node{type:"selector", alternates[]}` | `alternates[].{skill OR sub_track, preconditions[]}` | one chosen alternate dispatched; others marked skipped_alternates | I10 (alternates congruence), no-match yields | yes |
| Predicate | `{name, argument?}` | named predicate in v1 vocabulary | bool (pass/fail) | I11 (unknown predicate) | yes (deterministic given inputs) |
| Migrator | harness preflight detector | pre-§18 workflow.json | post-§18 workflow.json (in place) | unrecognized entry_phase, no canonical map | yes (idempotent on already-migrated input) |
| Doctor | `/init-project doctor` | none (interactive) | repaired workflows.jsonl + schemas/ + Article IV mirrors; report of fixes/skips | per-check named errors | yes (re-running offers same set of fixes) |
| CLI command | `/triage <request>` | natural-language request | populated workflow.json + materialized TaskList | invariant violations | re-runs replace |
| CLI command | `/init-project` (existing) | (existing) | populated workflows.jsonl + schemas/ on first run | (existing) | yes |

### Libraries and versions

No new third-party library APIs. The schema validation is inline instructions; the migrator is inline instructions; the doctor's interactive UI uses `AskUserQuestion` (already available in Claude Code's tool surface). `$schema` is a reference, not a runtime dispatch — editors can fetch it; we don't.

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| *(no third-party libraries introduced)* | — | — | n/a |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| Narrow `additions.workflow_tasks` (Draft 1) | Inject tasks at named anchors in hardcoded triage templates | User chose track-graph architecture instead |
| Track-graph v1 (Draft 2 without alternates) | Single canonical track per work-kind; swarm-vs-tdd decision lives in harness code | User chose alternates + preconditions for cleaner declarative model |
| Algorithmic substring-match classifier | Rank tracks by selector_hint length matching the request | User chose LLM-driven classification — selector_hints become descriptive aids, not match tokens |
| Confidence-threshold auto-skip on classifier match | Skip AskUserQuestion when top match is high-confidence | User: "ask user question is the only way, and yes this happens a lot." Always confirm. |
| swarm-plan mutates workflows.jsonl | Append sub-track entries directly to the source file | Couples runtime to config; baseline upgrades that change canonical tracks would conflict with runtime mutations |
| Refuse + restart on pre-§18 workflow.json | Detect old shape and tell user to start over | User: "UX is important when we are building for other developers." Migrator path chosen. |
| Defer $schema field to v2 | YAGNI: don't add schema versioning until v2 needs it | User: "yagni at this point is more technical debt for future." Declare $schema now; rejecting unknown versions early prevents silent drift later. |

## Design calls

This spec's write set targets `.claude/skills/triage/SKILL.md`, `.claude/skills/harness/SKILL.md`, `.claude/skills/swarm-plan/SKILL.md`, `.claude/skills/audit-baseline/audit.sh`, `.claude/commands/init-project.md`, `.claude/commands/init-project-doctor.md` (new), `.claude/workflows.jsonl` (new), `.claude/schemas/workflow-track.v1.json` (new), `src/.claude/workflows.template.jsonl` (new), `src/.claude/schemas/workflow-track.v1.json` (new), `docs/init/seed.md` (§3 + §18), `src/seed.template.md` (mirror), `CLAUDE.md` (Article IV), `src/CLAUDE.template.md` (mirror), `src/cli/install.js` (NEVER_TOUCH), `scripts/build-manifest.mjs` (NEVER_TOUCH_PATHS), and `tests/`. None intersect `project.json → tdd.ui_globs`.

- *(none)*

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| SP-001 | Given `workflows.jsonl` declares a `tdd-quickfix` track with 4 nodes (`scenario → implement → verify → commit`), when triage classifies a request to it, then the seeded TaskList contains those 4 tasks with `addBlockedBy` matching `depends_on[]`. | AC-009 | §B#1 |
| SP-002 | Given a Track contains a `can_parallel: true` cluster of 3 peer nodes (identical `depends_on[]`), when harness reaches the cluster, then all 3 dispatch concurrently via `Task` tool (swarm-worker), and `completed[]` updates atomically on all-success. | AC-010 | §B#2 |
| SP-003 | Given a Track node `N` carries `sub_track: "tdd-worker-chain"`, when harness invokes `N`, then sub-track nodes are TaskCreate'd, blockedBy is rewired at entry/exit, and `N` is marked completed as a wrapper. | AC-011 | §B#3 |
| SP-004 | Given a Track declares `invariants: ["commits"]` but lacks a `needs_user: true` `grant-commit` node ordered before `commit`, when triage loads the file, then triage halts with Article IV invariant-I6 named error citing the track id. | AC-012 | §B#5 |
| SP-005 | Given a Track node declares `skill: "<unknown>"` not in EXPECTED_SKILLS ∪ additions.skills, when triage loads, then triage halts with invariant-I8 named error citing track/node ids. | AC-013 | §B#5 |
| SP-006 | Given a malformed JSONL line OR a Track that violates the §18 schema, when triage or harness reads it, then the read halts with a named error citing file path, line number, and schema rule. No `workflow.json` is written. | AC-014 | §B#5 |
| SP-007 | Given Article IV is amended in CLAUDE.md (§18 added to seed.md) and the mirrors in `src/CLAUDE.template.md` / `src/seed.template.md` are byte-equal, when `audit-baseline.sh` runs, then it exits 0 and mirror checks pass. Breaking one mirror SHALL fail audit. | AC-015 | §B#10 |
| SP-008 | Given the 4 canonical hardcoded triage templates are migrated to `workflows.jsonl`, when triage receives identical requests pre- vs post-amendment, then the seeded TaskList is byte-equivalent (modulo selector-node wrapper ids whose names are deliberately new). | AC-016 | §B#9 |
| SP-009 | Given this repo's `.claude/workflows.jsonl` declares a `cli-copy-review` node in `intake-full` and `tdd-quickfix` tracks (positioned between memory-flush and grant-commit), when triage selects either track, then the seeded TaskList includes cli-copy-review at the declared position AND `grep -rn "cli-copy-review" .claude/skills/triage/SKILL.md` returns 0 lines. | AC-002, AC-009 | §B#9 |
| SP-010 | Given the hardcoded "Conditional: CLI copy review" rule is removed from triage SKILL.md and the new track-selector logic is in place, when `audit-baseline.sh` runs, then it exits 0 and triage's hash matches the regenerated manifest entry. | AC-006 | §B#10 |
| SP-011 | Given an installed target with a user-customized `workflows.jsonl`, when `create-baseline upgrade <target>` runs, then the file is preserved verbatim via NEVER_TOUCH_PRESERVE; the user's tracks remain intact. | AC-007 | §B#8 |
| SP-012 | Given a fresh install, when it completes, then `<new-target>/.claude/workflows.jsonl` and `<new-target>/.claude/schemas/` exist and validate against §18. | AC-008 | §B#8 |
| SP-013 | Given triage classifies the request via LLM reasoning over track descriptions + selector_hints, when triage presents picked + alternate tracks via `AskUserQuestion`, then the user's pick (suggested OR alternate OR escape-to-clarify) is the track materialized into the TaskList. | AC-021 | §B#1 |
| SP-014 | Given a track contains a selector node with two alternates (swarm sub-track with preconditions `requires_git` + `requires_min_components:3`, tdd sub-track with empty preconditions), when harness reaches the selector AND `requires_git` fails (non-git project), then the swarm alternate goes to `skipped_alternates[]` and the tdd sub-track expands inline. | AC-017 | §B#4 |
| SP-015 | Given a Track carries `"$schema": "<URL>"` whose version is not in `{workflow-track.v1.json}`, when triage or doctor reads it, then it halts with named error citing unknown version + supported versions + remediation pointer to `/init-project doctor`. | AC-022 | §B#5 |
| SP-016 | Given an installed target has a pre-§18 `workflow.json` (`entry_phase` field set, no `track_id`), when the user runs `/harness` post-upgrade, then a one-shot migrator transforms it in place — track_id derived via canonical map, completed phase-names mapped to node ids — before harness loads it. | AC-018 | §B#6 |
| SP-017 | Given `.claude/workflows.jsonl` has schema/invariant violations OR is absent, when the user runs `/init-project doctor`, then the doctor detects each violation, reports each with remediation, and on user confirmation applies fixes; re-runs report pass/fail. | AC-019 | §B#7 |
| SP-018 | Given the `.claude/` tooling convention is documented in seed.md §3, when `/init-project doctor` runs on a project with shipped tooling outside `.claude/` (other than CLAUDE.md / .mcp.json), then doctor flags the convention violation and offers to move the file. | AC-020 | §B#7 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | Triage selects intake-full for a feature request | LLM picks it; AskUserQuestion presents picked + alternates; user confirms; TaskList seeded | SP-001, SP-013 |
| Golden path | Triage selects chore for a docs-edit request | LLM picks chore; AskUserQuestion confirms; chore-track TaskList | SP-001, SP-013 |
| Golden path | Selector resolves swarm alternate on git repo with 3+ components | swarm-implementation sub-track expanded; tdd alternate skipped | SP-014 |
| Golden path | Selector resolves tdd alternate on non-git repo | tdd-worker-chain sub-track expanded; swarm alternate skipped | SP-014 |
| Golden path | Selector resolves tdd alternate when user explicitly overrides ("use solo") | user override predicate flips selection; swarm skipped | SP-014 |
| Golden path | Harness reaches can_parallel cluster of 3 swarm-workers | All 3 dispatched via Task tool; completed[] updates after all-success | SP-002 |
| Golden path | Sub-track expansion: node has sub_track="tdd-worker-chain" | sub-nodes TaskCreate'd; blockedBy rewired; wrapper completed | SP-003 |
| Golden path | This repo's tracks include cli-copy-review nodes | TaskList contains them at the declared position; no hardcoded reference in triage SKILL.md | SP-009 |
| Golden path | audit-baseline post-amendment | exits 0; mirror checks pass; manifest hash matches | SP-007, SP-010 |
| Lifecycle | Fresh install creates workflows.jsonl + schemas/ from template | both present; schema-valid | SP-012 |
| Lifecycle | Upgrade preserves user-customized workflows.jsonl + schemas/ | NEVER_TOUCH_PRESERVE; bytes intact | SP-011 |
| Lifecycle | Pre-§18 workflow.json on disk; user runs /harness | migrator transforms in place; harness proceeds | SP-016 |
| Lifecycle | Pre-§18 workflow.json with unmapped entry_phase | migrator yields with named error; user runs /triage to restart | SP-016 |
| Lifecycle | /init-project doctor on a project with missing workflows.jsonl | offers restore-from-template; on accept, file present | SP-017 |
| Lifecycle | /init-project doctor on a project with shipped tooling at root | flags convention violation; offers move to .claude/ | SP-018 |
| Migration | Byte-equivalent: pre vs post triage on identical request | TaskLists match (subjects, metadata.phase, blockedBy edges) | SP-008 |
| Contract violation | JSONL malformed line K | named error citing line K | SP-006 |
| Contract violation | Track missing required field | named error citing track + field | SP-006 |
| Contract violation | Track with unknown field (strict schema) | named error citing unknown field | SP-006 |
| Contract violation | Node has both skill and sub_track | I3 named error | SP-006 |
| Contract violation | Node has neither skill nor sub_track AND not type=selector | I3 named error | SP-006 |
| Contract violation | type=selector node with empty alternates[] | I3 named error | SP-006 |
| Contract violation | Selector alternates have divergent depends_on | I10 named error | SP-006 |
| Contract violation | depends_on references unknown node id | I4 named error | SP-006 |
| Contract violation | DAG has a cycle | I5 named error | SP-006 |
| Contract violation | commits-track without grant-commit gate | I6 named error | SP-004 |
| Contract violation | Skill in node does not resolve | I8 named error | SP-005 |
| Contract violation | needs_user node ordered AFTER dependent node | I9 named error | SP-006 |
| Contract violation | Predicate name unknown | I11 named error | SP-006 |
| Contract violation | Track.$schema references unknown version | named error citing $schema + supported versions | SP-015 |
| Concurrency | Can_parallel cluster with mixed success/failure | yield on first failure; reason names the node | SP-002 |
| Concurrency | Sub-track expansion mid-flight | TaskList shows sub-nodes; no edge orphaning | SP-003 |
| Regression trap | After retrofit, grep cli-copy-review in baseline-owned skills returns 0 lines | confirms migration | SP-009, SP-010 |
| Regression trap | Article IV / §18 mirror drift introduced manually | audit detects + FAILS | SP-007 |
| Regression trap | Pre-§18 audit-baseline tests still pass | unchanged regression coverage | SP-007, SP-010 |

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Log | `harness/<slug>.log:track-loaded` | `<UTC> track-loaded: track_id=<X> nodes=<N> overlay=<bool>` | Confirms load + overlay merge |
| Log | `harness/<slug>.log:selector-resolved` | `<UTC> selector: node=<id> chose=<alternate-id> reason=<predicate-name pass/fail summary>` | Per selector resolution |
| Log | `harness/<slug>.log:dispatch` | `<UTC> dispatch: node=<id> skill=<name> mode=sequential|parallel` | One per node dispatch |
| Log | `harness/<slug>.log:cluster-dispatch` | `<UTC> cluster: peers=<csv> mode=parallel` | When can_parallel fires |
| Log | `harness/<slug>.log:sub-track-expand` | `<UTC> expand: parent=<id> sub_track=<id> added=<N>` | One per expansion |
| Log | `harness/<slug>.log:migrate` | `<UTC> migrated: from=entry_phase=<X> to=track_id=<Y>` | Migrator fired |
| Log | `harness/<slug>.log:invariant-violation` | `<UTC> invariant: I<N> track=<id> node=<id> message=<text>` | Validation failure |
| Log | `init/<UTC>.doctor.log` | per-check pass/fail + per-fix accept/skip | Doctor session record |

## Rollout

This is a major refactor: triage rewrite, harness rewrite, swarm-plan rewrite, new /init-project doctor command, new files (workflows.jsonl, schemas/), constitutional amendment (CLAUDE.md Article IV + seed.md §18), four-way mirror, NEVER_TOUCH semantics generalization, byte-equivalence migration, in-flight workflow.json migrator. Lands as multiple commits in one workflow but as a single coordinated landing.

- **Feature flag**: none. Constitutional amendment; partial rollout = inconsistent state.
- **Migration order** (during /tdd, in dependency order):
  1. Write `.claude/schemas/workflow-track.v1.json` (the JSON Schema document referenced by Track.$schema).
  2. Add §3 + §18 to `docs/init/seed.md`; mirror to `src/seed.template.md`.
  3. Amend Article IV in `CLAUDE.md`; mirror to `src/CLAUDE.template.md`.
  4. Add `src/.claude/workflows.template.jsonl` + `src/.claude/schemas/` (pristine ship-time).
  5. Add `.claude/workflows.jsonl` (this repo's live config; 4 selectable + 2 sub + cli-copy-review insertions).
  6. Generalize NEVER_TOUCH semantics in `src/cli/install.js` + `scripts/build-manifest.mjs` to accept directory globs.
  7. Add `.claude/workflows.jsonl` + `.claude/schemas/` to NEVER_TOUCH; add `.claude/state/swarm/` to runtime-state exclusion.
  8. Rewrite `.claude/skills/triage/SKILL.md` to LLM-driven selector with AskUserQuestion confirm.
  9. Rewrite `.claude/skills/harness/SKILL.md` to graph executor + migrator + selector resolver.
  10. Rewrite `.claude/skills/swarm-plan/SKILL.md` to emit runtime sub-track overlay.
  11. Update `.claude/commands/init-project.md` to seed workflows.jsonl + schemas/.
  12. Add `.claude/commands/init-project-doctor.md` (new).
  13. Update `.claude/skills/audit-baseline/audit.sh` to validate workflows.jsonl + four-way mirror.
  14. Tests: per the Test plan; ≥1 per AC.
  15. Build template + run audit. Stage 4 gate is canary.
- **Canary**: the build's audit gate. Downstream installs only receive on next `create-baseline upgrade`.

## Rollback

- **Kill-switch**: `git revert <commit-set>`. Removes new files; reverts skill bodies.
- **In-flight workflows post-revert**: workflow.json files written under the new shape are forward-incompatible with the reverted (old) code. On revert, in-flight workflows restart via /triage. Acceptable for a constitutional change.
- **Signal to roll back**: audit fails OR any new-corpus test fails — both surface in build Stage 4 before commit lands.

## Archive plan

- Defaults *(automatic)*: intake, scout, research, spec, rendered diagrams, spec approval token.
- Extras *(list any non-default files)*:
  - *(none)*

## Open questions

The user resolved all 10 of the previous draft's open questions. The remaining items below are smaller and resolvable in /tdd rather than blocking /approve-spec.

- **OQ-A. Exact predicate vocabulary for v1.** Spec proposes `requires_git`, `requires_user_override:<value>`, `requires_min_components:<int>`, `requires_phase_completed:<phase>`, `requires_skill_present:<skill_id>`. Are all 5 needed for the canonical 4-track migration, or can we ship with 2-3 and add the rest when first needed? Lean: ship `requires_git` and `requires_min_components` for v1 (enough for the swarm-vs-tdd selector); declare the rest in seed.md §18.4 but reject them at parse time until implemented. YAGNI defaults pushback noted — could go either way.
- **OQ-B. Migrator's behavior on unmapped `entry_phase`.** Pre-§18 workflow.json could in principle carry an `entry_phase` that doesn't map cleanly (e.g., a custom track from a fork). Migrator should yield with named error and tell user to restart via /triage. Spec assumes this; called out for confirmation.
- **OQ-C. Doctor's exact UI surface.** Bash interactive (read line) OR via AskUserQuestion (single-question-per-fix)? Doctor lives under `.claude/commands/` which means it's user-typed slash command. AskUserQuestion is the more consistent UX. Lean AskUserQuestion.
- **OQ-D. JSON Schema document location.** `.claude/schemas/workflow-track.v1.json` proposed. Alternative: ship as a remote URL (e.g., `https://baseline.friedbotstudio.com/schemas/...`) for editor integration. Spec defaults local (offline-friendly); URL is opt-in via Track.$schema reference. Confirm.
- **OQ-E. `selector_hints[]` style guide.** Full-sentence descriptive phrases for the LLM, OR shorter keyword-style hints? Trade-off: longer = more accurate classification, shorter = faster Claude reads. Spec defaults full-sentence; defer to /tdd to settle the canonical examples.
