# Spec — erp-portables: port ten erp governance/harness improvements into the baseline

<!--
Technical spec. Produced by the `spec` skill. Epic track — one ## Slice section per child.
Approval: token via /approve-spec only.
-->

## Context

| Input | Path |
|---|---|
| Intake | `docs/intake/erp-portables.md` |
| Brief | `docs/brief/erp-portables.md` |
| Scout | `docs/scout/erp-portables.md` |
| Research | `docs/research/erp-portables.md` (Candidate C — hybrid) |

**Write set**: `docs/init/seed.md`, `src/seed.template.md`, `CLAUDE.md`, `src/CLAUDE.template.md`, `.claude/CONSTITUTION.md`, `.claude/hooks/branch_guard.mjs`, `.claude/hooks/lint_runner.mjs`, `.claude/hooks/test_runner.mjs`, `.claude/hooks/lib/common.mjs`, `.claude/settings.json`, `src/settings.template.json`, `.claude/schemas/workflow-track.v1.json`, `.claude/workflows.jsonl`, `.claude/skills/triage/**`, `.claude/skills/brainstorm/**`, `.claude/skills/harness/SKILL.md`, `.claude/skills/commit/SKILL.md`, `.claude/skills/scout/SKILL.md`, `.claude/skills/research/SKILL.md`, `.claude/skills/spec-traceability-review/**`, `.claude/skills/audit-baseline/**`, `.claude/skills/commit-planner/**`, `.claude/skills/retrospective/**`, `src/cli/track-tasklist-materializer.js`, `.githooks/**`, `scripts/ci/**`, `.github/branch-protection/**`, `.github/workflows/auto-merge.yml`, `scripts/build-template.sh`, `src/cli/**`, `src/project.template.json`, `.claude/skills/memory-flush/SKILL.md`, `tests/**`, `README.md`, `site-src/**`, `obj/template/**`

**Porting modes** (research Candidate C): **PORT** = adapt erp file + tests near-verbatim; **REAUTHOR** = write fresh from the extraction reports in baseline voice; **GREENFIELD** = build new against this repo's surfaces, erp as shape reference only.

## Goal

The baseline carries all ten portable erp improvements — constitution (seed → CLAUDE.md + mirror → annex) and implementation — landing as ten separately-committed epic children, with erp defaults where policies flip.

## Non-goals

- ERP-specific content (guardians, `governance-review` phase, `.claude/governance/`, U1–U12, boundary guards, record-review/verification tokens, communicator register, Golden Rule, where-things-live).
- erp's org-track deferral (baseline keeps its live `org` track).
- Changes to the consent handshake (markers, TTLs, `consent_gate_grant`) beyond the conditional grant-commit node; gate C stays binding on protected branches.
- New subagents (writing-subagent count stays 1); `swarm.min_tasks_worth_swarming` stays 3 (erp's 3→2 is out of scope).
- Flipping the brainstorm read-time default (maintainer decision 2026-07-03: absent `skip_brainstorm` keeps meaning RUN; only the explicit flag skips).
- Forcing the CI posture on consumers — J2 ships it default-on WITH a CLI opt-out; projects using their own solution opt out cleanly.

## Design

### C4 — System context

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — baseline harness (erp-portables port)
Person(maintainer, "Maintainer", "authors amendments, approves gates")
System(baseline, "Claude Code baseline repo", "constitution + hooks + skills + track machinery + build")
System_Ext(erp, "../erp reference repo", "read-only source of proven amendments")
System_Ext(github, "GitHub", "PRs, branch protection, Actions CI")
System_Ext(bins, "gitleaks + gh CLIs", "secret scan; PR creation")
Rel(maintainer, baseline, "amends via 11-phase workflow")
Rel(baseline, erp, "reads reference implementation")
Rel(baseline, github, "push, PR, protection config")
Rel(baseline, bins, "invokes at pre-commit / landing")
@enduml
```

### C4 — Container

```plantuml
@startuml
!include <C4/C4_Container>
title Container — baseline repo
System_Boundary(baseline, "baseline") {
  Container(constitution, "Constitution chain", "md", "seed.md > CLAUDE.md + mirror > annex")
  Container(hooks, "Enforcement hooks", "node mjs", ".claude/hooks — 25 to 26")
  Container(skills, "Workflow skills", "SKILL.md + mjs", "triage, brainstorm, harness, commit, reviews")
  Container(tracks, "Track machinery", "json + jsonl + js", "workflow-track schema, workflows.jsonl, materializer")
  Container(build, "Build pipeline", "bash + node", "build-template.sh, obj/template, manifest")
  Container(ci, "Git/CI surface", "bash + yml", ".githooks, scripts/ci, .github")
}
Rel(constitution, hooks, "declares roster; hooks enforce")
Rel(skills, tracks, "materialize + validate DAGs")
Rel(hooks, tracks, "read project.json git model")
Rel(build, hooks, "hashes into manifest")
Rel(build, skills, "hashes into manifest")
Rel(ci, hooks, "pre-commit complements guards")
@enduml
```

### C4 — Component (changed containers)

```plantuml
@startuml
!include <C4/C4_Component>
title Component — enforcement hooks + track machinery (changed parts)
Container_Boundary(hooks, "Enforcement hooks") {
  Component(bg, "branch_guard.mjs", "PreToolUse W/E/ME", "NEW: deny workflow.json creation on release branch under github-flow")
  Component(lr, "lint_runner.mjs", "PostToolUse", "CHANGED: honor lint.file_globs")
  Component(tr, "test_runner.mjs", "PostToolUse", "CHANGED: honor test.file_globs")
  Component(common, "lib/common.mjs", "shared", "NEW: currentBranch, isProtectedBranch, isAutonomousFeatureLanding")
}
Container_Boundary(tracks, "Track machinery") {
  Component(schema, "workflow-track.v1.json", "JSON Schema", "CHANGED: node condition predicate requires_commit_consent")
  Component(mat, "track-tasklist-materializer.js", "src/cli canonical + skill mirror", "CHANGED: resolve node conditions; omit unsatisfied consent nodes")
  Component(val, "workflows-validator-*.js", "node", "CHANGED: I11 extended to node conditions; I6 preserved")
}
Rel(bg, common, "composes")
Rel(mat, common, "resolves predicate via")
Rel(mat, schema, "validates against")
Rel(val, schema, "enforces")
@enduml
```

### Data model — class diagram

State objects only (no database in this system).

```plantuml
@startuml
title Data model — workflow + track state
class WorkflowJson {
  +track_id: string
  +novelty: enum <<new>>
  +track_reason: string? <<new>>
  +skip_brainstorm: bool <<changed>>
  +completed: string[]
  +exceptions: string[]
}
class TrackNode {
  +id: string
  +needs_user: bool
  +condition: Predicate? <<new>>
  +depends_on: string[]
}
class Predicate {
  +name: string
  +note: requires_commit_consent <<new>>
}
class LandingContext {
  +workflow_model: string
  +branch: string
  +protected: bool <<new>>
  +autonomous_landing: bool <<new>>
}
TrackNode "0..1" o-- Predicate
WorkflowJson "1" --> "1" TrackNode : materialized from
LandingContext ..> Predicate : evaluates
note on link
  novelty: pattern-copy | spec-derived | novel | ambiguous
  skip_brainstorm: triage now writes it explicitly every workflow;
  read-time default for an absent flag is UNCHANGED (run)
end note
@enduml
```

#### Migration DDL

```sql
-- No database in this system. State migrations are JSON-shape changes:
-- workflow.json gains optional `novelty`, `track_reason` (absent = pre-port file, valid);
-- workflows.jsonl nodes gain optional `condition` (absent = unconditional, valid).
-- Both additive; no reverse migration needed.
```

### Behavior — sequence per AC

```plantuml
@startuml
title Behavior #1 — advisory subagents gather; main context decides (slice A)
participant "scout/research skill\n(main context)" as main
participant "read-only advisory subagent\n(Explore/general-purpose)" as adv
main -> adv : gather(prompt: files/patterns to map)
adv --> main : findings (text; no writes, no decisions)
main -> main : decide what enters the report
main -> main : Write docs/scout|research/<slug>.md
note right : binding judgment + all writes stay in main context\n(amended seed §4.2 + Article II)
@enduml
```

```plantuml
@startuml
title Behavior #2 — branch_guard denies workflow start on release branch (slice B)
participant "Claude (Write tool)" as w
participant "branch_guard.mjs" as bg
participant "lib/common.mjs" as c
w -> bg : PreToolUse Write .claude/state/workflow.json (create)
bg -> c : resolveWorkflowModel(), currentBranch(), isPrimaryWorkTree()
alt github-flow AND branch in release set AND primary tree AND file absent
  bg --> w : deny {reason: start work on a feature branch}
else any ambiguity (non-git, configured:false, other model, linked worktree, detached HEAD, existing-file edit)
  bg --> w : allow (fail-open)
end
@enduml
```

```plantuml
@startuml
title Behavior #3 — branch-aware gate C: autonomous landing (slice C)
participant "triage materializer" as mat
participant "harness" as h
participant "commit skill" as cs
participant "lib/common.mjs" as c
mat -> c : evaluate requires_commit_consent (isProtectedBranch)
alt protected branch OR ask/direct-to-main OR non-git OR detached OR linked worktree
  mat -> mat : include grant-commit node (needs_user)
  h -> h : yield at gate C (today's behavior)
else non-protected feature branch under github-flow
  mat -> mat : omit grant-commit node
  h -> c : isAutonomousFeatureLanding() == true
  h -> cs : Skill(commit)
  cs -> cs : git commit ; git push -u origin <branch>
  cs -> cs : gh pr create --base <release branch>
  alt gh absent or push/PR fails
    cs --> h : failure -> yield to user (fail-safe)
  end
end
@enduml
```

```plantuml
@startuml
title Behavior #4 — leanest-safe-track triage with novelty (slice D)
actor User
participant "triage skill" as t
User -> t : /triage "<request>"
t -> t : Step 0: classify novelty (pattern-copy | spec-derived | novel | ambiguous) + cite evidence
t -> t : rank tracks; DEFAULT = leanest track whose guardrails cover the risk
alt heavier track chosen
  t -> t : record named track_reason in workflow.json
end
t -> User : AskUserQuestion confirm (unchanged)
t -> t : write workflow.json {novelty, track_reason?, skip_brainstorm (explicit)}
@enduml
```

```plantuml
@startuml
title Behavior #5 — opt-in derivation-first brainstorm (slice E)
participant "entry skill\n(intake|spec|tdd)" as e
participant "brainstorm skill" as b
actor User
e -> e : read skip_brainstorm (triage wrote it explicitly; absent still resolves to RUN — read-time default unchanged)
alt skip_brainstorm true (spec-derived / complete framing)
  e -> e : proceed to template-fill (no dialogue)
else false (genuinely ambiguous AND answers change the build)
  e -> b : Skill(brainstorm)
  b -> b : Stage 1 derives fields from context first
  loop underivable, build-changing gaps only (cap 2)
    b -> User : AskUserQuestion probe
    alt timeout
      b -> b : adopt recommended option as recorded assumption
      b -> b : queue assumption for next consent gate
    end
  end
  b -> e : brief
end
@enduml
```

```plantuml
@startuml
title Behavior #6 — decision economy (slice F)
participant "phase skill" as p
actor User
p -> p : fork encountered
alt routine engineering choice
  p -> p : decide in main context
  p -> p : record in spec ## Decisions (owner: engineer)
  note right : reviewed at gate A, not asked
else human's-call fork (annex category list)
  p -> User : AskUserQuestion / gate-A decision point
  alt timeout inside phase skill
    p -> p : adopt recommendation as recorded assumption; surface at next consent gate
  end
end
note over p : consent gates still block — never auto-satisfied
@enduml
```

```plantuml
@startuml
title Behavior #7 — two-sided faithful scope BLOCKER (slice G)
participant "checker-fanout" as cf
participant "spec-traceability oracle" as o
participant "gate A reviewer" as r
cf -> o : run(spec, intake)
o -> o : find AC rows deferring spec-committed scope
alt deferral tagged dependency|risk|cost|human-directed
  o --> cf : pass (reason-tagged row)
else untagged OR YAGNI-tagged
  o --> cf : Critical BLOCKER
  cf --> r : surface before /approve-spec (defect to fix, never auto-approve)
end
@enduml
```

```plantuml
@startuml
title Behavior #8 — runners honor file_globs (slice H)
participant "PostToolUse event" as ev
participant "lint_runner / test_runner" as run
ev -> run : file path written
alt path matches lint|test.file_globs
  run -> run : execute configured cmd (today's behavior)
else no match
  run --> ev : skip silently (no command spawn)
end
@enduml
```

```plantuml
@startuml
title Behavior #9 — commit-planner and retrospective skills (slice I)
actor User
participant "commit-planner" as cp
participant "retrospective" as rs
User -> cp : Skill(commit-planner)
cp -> cp : inventory dirty tree (read-only)
cp --> User : proposed single-concern conventional-commit split (no writes until approved)
User -> rs : Skill(retrospective)
rs -> rs : collect recurring judgment failures (session/memory)
rs -> rs : write landmine entries; propose graduation (landmine -> advisory hook -> hard gate)
rs --> User : retro report + graduation candidates
@enduml
```

```plantuml
@startuml
title Behavior #10 — CI/secrets posture (slice J)
participant "git commit" as gc
participant ".githooks/pre-commit" as pc
participant "scripts/ci/require-gitleaks.sh" as rg
participant "auto-merge classifier" as amc
gc -> pc : pre-commit fires
pc -> rg : check
alt gitleaks binary present
  rg --> pc : exit 0 ; pc runs scan on staged diff
else absent
  rg --> pc : exit 1 -> commit hard-fails
end
== PR auto-merge ==
amc -> amc : classify PR diff
alt touches .githooks/** .claude/hooks/** .github/** scripts/ci/** deps licence/SBOM governance docs
  amc --> amc : NEVER auto-merge (human merges)
else low-risk AND checks green
  amc --> amc : enable auto-merge via gh
end
@enduml
```

```plantuml
@startuml
title Behavior #12 — consumer shipping with CLI opt-out (slice J2)
actor Consumer
participant "create-baseline\ninit-project" as init
participant "upgrade-project" as up
participant "obj/template" as tpl
Consumer -> init : install (default)
init -> tpl : deliver CI-posture artifacts
init -> init : project.json ci_posture.enabled = true
== opt-out ==
Consumer -> init : install --no-ci-posture
init -> init : ci_posture.enabled = false ; skip artifact delivery
== upgrade ==
Consumer -> up : upgrade existing project
up -> up : read ci_posture.enabled
alt enabled
  up -> tpl : refresh posture artifacts
else opted out
  up -> up : never re-deliver; never touch consumer's own hooks
end
@enduml
```

```plantuml
@startuml
title Behavior #13 — read-before-write state discipline (slice K)
participant "harness preflight" as pf
participant "loop body / phase skill" as loop
pf -> pf : Read harness_state + workflow.json ONCE (unconditional)
loop -> loop : Write/Edit existing file
note right : preceded by a Read this session\n(batched in preflight when writes are known)\n-> zero "read it first" tool failures
@enduml
```

```plantuml
@startuml
title Behavior #11 — epic-wide enforcement gates (preflight + smoke)
participant "epic child commit" as ch
participant "audit-baseline" as ab
participant "test suite" as ts
ch -> ab : node .claude/skills/audit-baseline/audit.mjs
ab --> ch : exit 0 (counts, roster, 40k cap, byte-equal mirror) — else child blocks
ch -> ts : npm test (full suite)
ts --> ch : green — else child blocks
@enduml
```

### State — core entity *(only if stateful)*

No new state machine; landing-state transitions are covered in Behavior #3. *(omitted deliberately)*

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — erp-portables slices
left to right direction
[B branch_guard] --> [common.mjs predicates]
[C gate-C landing] --> [common.mjs predicates]
[C gate-C landing] --> [track schema condition]
[track schema condition] --> [materializer + validators]
[DEF doctrine] --> [workflows.jsonl rebalance]
[G traceability BLOCKER] --> [checker-fanout registry]
[A article II] --> [seed.md amendment]
[DEF doctrine] --> [seed.md amendment]
[counts reconciliation] --> [B branch_guard]
[counts reconciliation] --> [I new skills]
[J1 CI posture] --> [scripts/ci]
[J2 consumer ship] --> [J1 CI posture]
[J2 consumer ship] --> [build-template + CLI]
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Hook | `branch_guard.decide(input)` | `{tool_input, projectJson, git ctx}` | `{decision: "allow"\|"deny", reason?}` | never throws; fail-open allow | yes (pure) |
| Fn | `currentBranch(cwd?)` | cwd | branch name string \| `"HEAD"` (detached) \| `null` (non-git) | never throws | yes |
| Fn | `isProtectedBranch(projectGit, branch)` | `git.protected_branches` globs (+`null`=all), branch | bool | never throws | yes |
| Fn | `isAutonomousFeatureLanding({projectJson, cwd?})` | project git config + repo state | bool — true ONLY for non-protected feature branch under `github-flow` on primary tree, named branch | never throws; false on any doubt | yes |
| Schema | `TrackNode.condition` | optional `{predicate: "requires_commit_consent"}` | materializer includes node iff predicate true or ctx missing (fail-safe include) | validator I11 rejects unknown predicate | — |
| CLI | `seed-tasklist.mjs <track> <slug>` | unchanged args | tasklist JSON, consent node omitted per condition | non-zero + named error | yes |
| Fn | `runProbeLoop({gaps, askFn, cap=2})` | gap list | `{closed, open_questions}` | cap-capped | yes |
| Fn | `withDefaults(workflowJson)` | raw workflow.json | UNCHANGED — `skip_brainstorm` absent → `false` (run); opt-in comes from triage writing the flag | never throws | yes |
| Config | `project.json → ci_posture.enabled` | bool, template default `true` | init-project honors `--no-ci-posture`; upgrade-project respects existing value | absent → treated `true` on fresh install only | yes |
| SOP | harness preflight read-before-write | — | Read `harness_state` + `workflow.json` once before first state write | — | yes |
| Oracle | `runTraceabilityOracle({spec,intake})` | artifact text | findings incl. `deferral_untagged` Critical BLOCKER | never throws | yes |
| Hook | `lint_runner`/`test_runner` glob gate | written file path | run cmd iff path matches `lint\|test.file_globs` (absent globs → run, today's behavior) | fail-open run | yes |
| Skill | `commit-planner` | dirty tree | proposed commit split (read-only) | — | yes |
| Skill | `retrospective` | session + memory | landmine entries + graduation candidates | — | re-runnable |
| CLI | `scripts/ci/require-gitleaks.sh` | none | exit 0 present / exit 1 absent (message names install cmd) | — | yes |
| CLI | `scripts/ci/low-risk-classifier.mjs` | PR diff paths | `{low_risk: bool, reason}` — NEVER-list always false | — | yes |
| CLI | `scripts/ci/apply-branch-protection.mjs` | `.github/branch-protection/main.json` | applies via `gh api`; subset-asserts against green main | non-zero on drift | yes |

### Libraries and versions

No third-party library APIs are used by any slice (node stdlib + existing repo helpers). `gitleaks` and `gh` are external CLI binaries exercised via exit codes; runtime dep `@clack/prompts@1.4.0` untouched. Context7: nothing to confirm (research memo, Library note).

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| *(none — stdlib only)* | — | — | n/a |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| A | Faithful file port from erp | leaks ERP citations/counts/gradle contexts into constitution + CI |
| B | Clean-room re-derivation | discards erp's tested edge-case coverage; slowest |
| C (chosen) | Hybrid: PORT mechanics, REAUTHOR doctrine, GREENFIELD J | requires per-slice mode labels (declared per slice below) |

## Design calls

Write set intersects `tdd.ui_globs` only via `site-src/**` count-text sync (docs site pages carrying "25 hooks"/"46 skills" counts).

| Slug | Intent | Target files | Write set | Register | References |
|---|---|---|---|---|---|
| docsite-count-sync | text-only count sync (25→26 hooks, 46→48 skills) in existing docs pages; no layout/visual change | count-bearing pages under `site-src/` | `site-src/**` | inherit | `audit-baseline-docsite-drift.test.mjs` |

## Slice A — Article II §4.2-A: read-only advisory subagents

Mode: **REAUTHOR** (constitution) + **PORT** (skill prose diffs). Re-scope Article II's ban from "conversational judgment" to **binding judgment** (a written decision or production change). Read-only advisory subagents (Explore, Plan, research gathering, oracle-bound checkers — already §II.A) are permitted: they review and advise; main context decides and writes. Amend `seed.md §4.2` FIRST, then CLAUDE.md Article II + `src/CLAUDE.template.md`, annex amendment-history entry. Amend `scout`/`research` SKILL.md: gathering MAY be delegated to read-only advisory subagents; report content decisions stay in main context (scout's "Project source is read-only" constraint unchanged).
**ACs**: AC-001. **Write surface**: `docs/init/seed.md`, `src/seed.template.md`, `CLAUDE.md`, `src/CLAUDE.template.md`, `.claude/CONSTITUTION.md`, `.claude/skills/scout/SKILL.md`, `.claude/skills/research/SKILL.md`, tests (`article-ii` structural test), `obj/template/**`.

## Slice B — branch_guard hook (25→26)

Mode: **PORT** (hook + test from erp; erp file is generic) + **REAUTHOR** (counts/prose — re-derive, do NOT copy erp's "27 hooks" sentence). New `.claude/hooks/branch_guard.mjs`: PreToolUse Write|Edit|MultiEdit; denies only CREATION of `.claude/state/workflow.json` when `git.workflow_model` resolves `github-flow` AND `currentBranch()` matches `git.release_branches` (default `["main"]`) AND primary worktree AND `configured: true`; fail-open otherwise (per Behavior #2). Pure exported `decide()`; add `currentBranch()` to `lib/common.mjs`. Wire in `.claude/settings.json` (+ `src/settings.template.json`) after `track_guard`. Reconcile: seed §4.1 (25→26 + hook row), CLAUDE.md preamble + Art. III greeting + Art. VIII table, annex, `expected-baseline.mjs` EXPECTED_HOOKS, README + `site-src` counts, manifest re-hash.
**ACs**: AC-002. **Write surface**: `.claude/hooks/branch_guard.mjs`, `.claude/hooks/lib/common.mjs`, `.claude/settings.json`, `src/settings.template.json`, constitution chain, `.claude/skills/audit-baseline/expected-baseline.mjs`, `README.md`, `site-src/**`, `tests/branch-guard*.test.mjs`, `obj/template/**`.

## Slice C — branch-aware gate C: autonomous commit→push→PR

Mode: **PORT** (predicates + materializer predicate + tests) + **REAUTHOR** (harness/commit SKILL.md prose, seed §11/§18 + Art. IV/VII notes). Add `isProtectedBranch()` + `isAutonomousFeatureLanding()` to `common.mjs` (fail-safe false per Behavior #3 alt). Schema: optional `TrackNode.condition` with predicate enum `requires_commit_consent` (reuse the existing §18 Predicate vocabulary — no new namespace; I6 static declaration preserved: grant-commit stays DECLARED on every commits-track; I11 extended to resolve conditions; missing ctx → include node, fail-safe). Materializer change lands in `src/cli/track-tasklist-materializer.js` first, Stage 0b syncs the skill mirror. Annotate `grant-commit` nodes in `workflows.jsonl`. Harness: no-yield carve-out at grant-commit when predicate omitted the node; commit skill Step 7: `git push -u` + `gh pr create --base <release>`; any push/PR/`gh`-absent failure → yield to user. Gate C byte-unchanged on protected branches; `git_commit_guard` untouched (commit-time backstop).
**ACs**: AC-003. **Write surface**: `.claude/hooks/lib/common.mjs`, `.claude/schemas/workflow-track.v1.json`, `src/cli/track-tasklist-materializer.js`, `.claude/skills/triage/track-tasklist-materializer.js` + `workflows-validator-*.js`, `.claude/workflows.jsonl`, `.claude/skills/harness/SKILL.md`, `.claude/skills/commit/SKILL.md`, constitution chain, tests, `obj/template/**`.

## Slice DEF — build-to-spec doctrine (leanest-track triage + opt-in brainstorm + decision economy)

One doctrine, one commit (mirrors erp `03697dd`; merged at gate-A review 2026-07-03 — the three parts are coupled: triage writes brainstorm's flag; brainstorm's probes exercise decision economy's timeout rule; all three amend the same constitution sections).

**D — leanest-safe-track triage.** Mode: **REAUTHOR** (SKILL.md prose + Article IV entry points) + **PORT** (flag-parser field handling). `/triage` Step 0 classifies novelty FIRST — `pattern-copy` / `spec-derived` / `novel` / `ambiguous` — with cited evidence, recorded as `workflow.json → novelty`; picks the LEANEST track whose guardrails cover the risk; a heavier track requires named `track_reason` (recorded). Entry-point rebalance: intake-full narrowed to genuinely novel surface; spec-entry broadened to spec-derived/pattern work (workflows.jsonl `description`/`selector_hints` text only — DAGs unchanged). AskUserQuestion confirm step unchanged.

**E — opt-in derivation-first brainstorm (NO read-time default flip).** Mode: **PORT** (probe-loop cap) + **REAUTHOR** (XI.3 + annex §5.3). Maintainer decision 2026-07-03: `workflow-defaults.mjs` is UNCHANGED — absent `skip_brainstorm` keeps resolving to `false` (brainstorm runs). Opt-in arrives solely via `/triage` Step 0 writing the flag EXPLICITLY on every workflow: `true` when the request derives from a spec chapter/roadmap/backlog/approved epic or carries complete framing; `false` only when genuinely ambiguous AND answers would change the build. `probe-loop.mjs` cap 5→2; Stage 1 becomes derivation-first (derive each canonical field from context; only underivable, build-changing gaps probe). Entry-skill Step 0.5 wording updated in `intake`/`spec`/`tdd` SKILL.md.

**F — XI.12 decision economy.** Mode: **REAUTHOR**. New CLAUDE.md XI.12 + annex §5.x: only load-bearing, human's-call forks may surface as questions or gate-A decision points (annex enumerates the categories: consent-adjacent scope, irreversible/destructive ops, policy flips, contradictory requirements). Routine engineering choices are decided in main context and RECORDED in the spec's `## Decisions` section with rationale (`owner: engineer`) — reviewed at gate A, not asked. AskUserQuestion timeout inside a phase skill adopts the recommended option as a recorded assumption surfaced at the next consent gate; questions never block an unattended run; consent gates still do. seed.md gains the corresponding §5/§6 note FIRST.

**ACs**: AC-004, AC-005, AC-006. **Write surface**: `.claude/skills/triage/SKILL.md` + `flag-parser.mjs`, `.claude/workflows.jsonl`, `.claude/skills/brainstorm/**` (probe-loop, SKILL.md; NOT workflow-defaults), `.claude/skills/intake/SKILL.md`, `.claude/skills/spec/SKILL.md`, `.claude/skills/tdd/SKILL.md`, constitution chain (Art. IV, XI.3, XI.12, annex §5.3/§5.x), `tests/brainstorm-*.test.mjs` + triage tests, `obj/template/**`.

## Slice G — two-sided faithful scope + VI.4 YAGNI note

Mode: **REAUTHOR** (constitution) + **PORT** (oracle check shape from erp's spec-traceability-review). VI.4 gains: "YAGNI gates speculation beyond the approved spec; it never authorizes deferring spec-committed scope." (seed §2.4 first). `spec-traceability-review` oracle + SKILL.md: an AC-table row that defers spec-committed scope MUST carry a reason tag from the closed list `dependency|risk|cost|human-directed` (row convention: `deferred: <reason>` in the Criterion cell); untagged or YAGNI-tagged deferral → Critical BLOCKER finding (reaches gate A via existing checker-fanout wiring — Behavior #7). Annex documents the closed list + row convention.
**ACs**: AC-007. **Write surface**: `.claude/skills/spec-traceability-review/oracle.mjs` + `SKILL.md`, `.claude/skills/spec/SKILL.md` (row convention), constitution chain, `tests/checker-oracle-traceability.test.mjs`, `obj/template/**`.

## Slice H — lint_runner/test_runner honor file_globs

Mode: **PORT** (erp's +9/+11 line fix). Both runners gate on `project.json → lint|test.file_globs` before spawning the configured command: written path matches → run (today's behavior); no match → skip silently. Absent/empty `file_globs` → run (back-compat, fail-open). Uses existing `matchAnyGlob` from `common.mjs`.
**ACs**: AC-008. **Write surface**: `.claude/hooks/lint_runner.mjs`, `.claude/hooks/test_runner.mjs`, `tests/runner-file-globs*.test.mjs`, `obj/template/**`.

## Slice I — commit-planner + retrospective skills

Mode: **REAUTHOR** (generalize from erp; drop erp roadmap/standup-format references). `commit-planner`: split a dirty working tree into single-concern Conventional Commits; deterministic `inventory.mjs` helper; read-only until the user approves the plan; frontmatter cross-references the `commit` skill (Phase 11 executor — disjoint jobs). `retrospective`: cycle-end retro converting recurring judgment failures into landmine entries and proposing graduation up the enforcement funnel (landmine → advisory hook → hard gate); pairs with `standup`; writes only memory entries + a report. Both `owner: baseline`. Counts 46→48: seed §4.3, CLAUDE.md Art. III greeting + Appendix quick-orientation, annex Appendix B, manifest `owners.skills` + hashes.
**ACs**: AC-009. **Write surface**: `.claude/skills/commit-planner/**`, `.claude/skills/retrospective/**`, constitution chain (counts), `.claude/skills/audit-baseline/**` (if roster lists skills), manifest, `README.md`, `site-src/**` (counts), tests, `obj/template/**`.

## Slice J1 — CI/secrets posture working in this repo

Mode: **GREENFIELD** (erp = shape reference; re-derive check contexts from this repo's `release.yml`). Three pieces: (1) `.githooks/pre-commit` + `scripts/ci/require-gitleaks.sh` — hard-fail commit when the gitleaks binary is absent (Behavior #10); staged-diff scan when present; `core.hooksPath` set via documented one-liner, NOT via `git config` automation (Art. VII hard-blocks `git config` — the hook path activation is a documented manual step for the maintainer). (2) `.github/branch-protection/main.json` config-as-code + `scripts/ci/apply-branch-protection.mjs` (gh-api applier, subset-asserts against green main; check contexts pinned to this repo's live release.yml checks, re-derived at implementation). The repo is PUBLIC (verified 2026-07-03: `friedbotstudio/baseline`), so the required-status ruleset is fully LIVE — no free-tier inert split. (3) `scripts/ci/low-risk-classifier.mjs` + auto-merge workflow — NEVER-list (enforcement hooks `.githooks/**` `.claude/hooks/**`, control plane `.github/**` `scripts/ci/**`, dependency manifests, licence/SBOM files, governance docs `CLAUDE.md` `docs/init/**` `.claude/CONSTITUTION.md`) always classifies not-low-risk. Everything authored template-ready (no repo-hardcoded paths beyond the check-context pins J2 parameterizes) so J2 can ship it without rework.
**ACs**: AC-010. **Write surface**: `.githooks/**`, `scripts/ci/**`, `.github/branch-protection/**`, `.github/workflows/auto-merge.yml`, `docs/**` (activation runbook), tests.

## Slice J2 — ship the CI posture to consumers behind an opt-out (depends on J1)

Mode: **GREENFIELD** (CLI + template shipping; no erp precedent — erp kept it repo-local). Maintainer decision 2026-07-03: ship default-on WITH a CLI opt-out ("the solution will be complete for real-world use-case plus end-users can opt-out if they're using different solution"). Pieces: (1) J1's artifacts land in `obj/template/` (`.githooks/pre-commit`, `scripts/ci/require-gitleaks.sh` + classifier + applier, branch-protection config as a fill-in template with THIS repo's contexts replaced by placeholders) via `scripts/build-template.sh`; manifest re-hash. (2) New `project.json → ci_posture.enabled` knob (template default `true`). (3) `init-project` gains the opt-out seam: prompt/flag (e.g. `--no-ci-posture`) sets the knob `false` and skips delivering the artifacts; `upgrade-project` respects the existing knob on upgrade (never re-delivers into an opted-out project, never deletes a consumer's own hooks). (4) Consumer docs: activation one-liner (`core.hooksPath`), opt-out path, and what each artifact does. Constitution: seed §16-adjacent config note + annex row; no new hook (git hooks are not Claude Code hooks — roster stays 26).
**ACs**: AC-013. **Write surface**: `scripts/build-template.sh`, `obj/template/**`, `src/cli/**` (init-project/upgrade-project seams), `src/project.template.json`, `.claude/skills/init-project*/**` (if the skill mirrors the seam), constitution chain (config note), docs, tests.

## Slice K — read-before-write state discipline

Mode: **REAUTHOR** (no erp precedent; maintainer request 2026-07-03). Failure mode: Write/Edit on an existing file not yet Read this session fails with "File has not been read yet", costing a failed tool call + retry — observed twice in this epic's own discovery (harness_state, workflow.json). A hook CANNOT fix this (hooks deny; they cannot perform the Read), so the fix is SOP-level: (1) harness SKILL.md preflight step — Read `.claude/state/harness_state` AND `.claude/state/workflow.json` once, unconditionally, before the first state write (covers every later marker/state refresh in the loop). (2) The state-write discipline (annex §2 + harness SKILL.md binding note) gains: "Read-before-write: any Write/Edit to an EXISTING file SHALL be preceded by a Read of that file in the same session; batch the Reads into preflight where the writes are known in advance (workflow state, memory files, constitution mirrors)." (3) Phase skills with known recurring writes (`commit` — workflow.json/backlog; `memory-flush` — canonical files it will edit) get a one-line read-first note at their write steps. No hook, no schema change, roster unchanged.
**ACs**: AC-014. **Write surface**: `.claude/skills/harness/SKILL.md`, `.claude/CONSTITUTION.md` (§2 state-write discipline), `.claude/skills/commit/SKILL.md`, `.claude/skills/memory-flush/SKILL.md`, structural test (SOP text present), `obj/template/**`.

## Acceptance criteria

| ID | Criterion (given / when / then) | Kind | Upstream AC | Sequence |
|---|---|---|---|---|
| AC-001 | given the amended Article II + seed §4.2, when a phase needs read-only gathering/advice, then read-only advisory subagents are permitted while every binding decision and write stays in main context; scout/research SKILL.md carry the gathering-delegation clause | behavior | intake AC 1 | §Behavior #1 |
| AC-002 | given `github-flow` + current branch in `git.release_branches` + primary tree + `configured: true`, when Write would CREATE `.claude/state/workflow.json`, then `branch_guard.decide()` denies with a named reason; given non-git / `configured: false` / other model / linked worktree / detached HEAD / existing-file edit it allows; roster count 26 reconciled everywhere audit-baseline checks | behavior | intake AC 2 | §Behavior #2 |
| AC-003 | given a non-protected feature branch under `github-flow`, when the tasklist is materialized and the harness lands, then the grant-commit node is omitted per `requires_commit_consent`, `isAutonomousFeatureLanding()` is true, and commit pushes + opens a PR (any failure → yield); given a protected branch / `ask` / `direct-to-main` / non-git / detached HEAD / linked worktree the predicate is false and gate C yields as today | behavior | intake AC 3 | §Behavior #3 |
| AC-004 | given any `/triage` run, when classification completes, then `workflow.json → novelty` carries one of `pattern-copy\|spec-derived\|novel\|ambiguous` with cited evidence, the leanest safe track is default, and a heavier pick carries a named `track_reason` | behavior | intake AC 4 | §Behavior #4 |
| AC-005 | given a spec-derived/complete-framing request, when an entry phase runs, then `skip_brainstorm: true` was written explicitly and no dialogue fires; given a genuinely ambiguous build-changing request, brainstorm runs derivation-first with probe cap 2; given an AskUserQuestion timeout, the recommended option is adopted as a recorded assumption surfaced at the next consent gate; an absent flag keeps today's read-time default (run) | behavior | intake AC 5 | §Behavior #5 |
| AC-006 | given a routine engineering fork inside a phase, when the phase would otherwise ask, then the choice is decided in main context and recorded in the spec `## Decisions` (`owner: engineer`) for gate-A review; only annex-listed human's-call categories may surface as questions; consent gates still block | behavior | intake AC 6 | §Behavior #6 |
| AC-007 | given an AC row deferring spec-committed scope, when `spec-traceability-review` runs, then a `deferred: dependency\|risk\|cost\|human-directed` tag passes and an untagged or YAGNI-tagged deferral yields a Critical BLOCKER at gate A; VI.4 carries the floor/ceiling note | behavior | intake AC 7 | §Behavior #7 |
| AC-008 | given a write to a path outside `lint.file_globs`/`test.file_globs`, when the runner fires, then no command is spawned; given a matching path or absent globs, the command runs as today | behavior | intake AC 8 | §Behavior #8 |
| AC-009 | given the landed port, when skills are audited, then `commit-planner` and `retrospective` exist with `owner: baseline`, generalized content (no erp references), manifest hashes, and 46→48 reconciled counts | behavior | intake AC 9 | §Behavior #9 |
| AC-010 | given a commit with the gitleaks binary absent, when `.githooks/pre-commit` runs, then it hard-fails via `require-gitleaks.sh` (exit 1, message names the install command); branch protection is config-as-code with a subset-asserting applier; the classifier returns `low_risk: false` for every NEVER-list path | behavior | intake AC 10 | §Behavior #10 |
| AC-011 | given any epic-child commit, when `audit-baseline` runs, then it exits 0 (roster, counts, 40k cap, Article XII citations) and `CLAUDE.md` ≡ `src/CLAUDE.template.md` byte-equal | preflight | intake AC 11 | §Behavior #11 |
| AC-012 | given any epic-child commit, when the full test suite runs, then it is green (217+ tests incl. the new/adapted ones) | smoke | intake AC 11 | §Behavior #11 |
| AC-013 | given a consumer install (default), when `init-project` runs, then CI-posture artifacts are delivered and `ci_posture.enabled: true`; given `--no-ci-posture` (or the prompt opt-out), none are delivered and the knob is `false`; given an upgrade of an opted-out project, `upgrade-project` never re-delivers and never touches the consumer's own hooks | behavior | intake AC 12 | §Behavior #12 |
| AC-014 | given the harness preflight, when it arms the loop, then `harness_state` and `workflow.json` are Read once before any state write; given any phase-skill Write/Edit to an existing file, a Read of that file happened this session — zero "File has not been read yet" tool failures across a full workflow | behavior | intake AC 13 | §Behavior #13 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | `branch_guard.decide()` on github-flow + main + create workflow.json | deny with reason | AC-002 |
| Golden path | materializer on feature branch omits grant-commit; harness lands; commit pushes + PRs | autonomous landing | AC-003 |
| Golden path | triage records novelty + leanest track; heavier pick requires track_reason | fields present | AC-004 |
| Golden path | runners skip non-matching path; run matching path | spawn iff match | AC-008 |
| Input boundary | detached HEAD / linked worktree / non-git / `configured:false` for branch_guard + landing predicate | allow / false (fail-safe) | AC-002, AC-003 |
| Input boundary | probe loop with 3 gaps | stops at cap 2 | AC-005 |
| Input boundary | `withDefaults({})` | `skip_brainstorm: true` | AC-005 |
| Contract violation | unknown `condition.predicate` in workflows.jsonl | validator rejects with named error | AC-003 |
| Contract violation | AC row `deferred: YAGNI` / untagged deferral | Critical BLOCKER finding | AC-007 |
| Contract violation | classifier on `.claude/hooks/**` diff | `low_risk: false` | AC-010 |
| Failure mode | `gh` absent / push rejected at autonomous landing | commit skill yields to user | AC-003 |
| Failure mode | gitleaks binary absent at pre-commit | exit 1, install-cmd message | AC-010 |
| Regression trap | protected-branch landing still yields at gate C; `git_commit_guard` byte-unchanged | unchanged | AC-003 |
| Regression trap | audit-baseline + mirror tests green after every child | exit 0 | AC-011, AC-012 |
| Regression trap | absent `file_globs` → runners run (back-compat) | unchanged | AC-008 |
| Regression trap | Article II structural test: swarm-worker remains sole writing subagent | unchanged | AC-001 |
| Golden path | init-project default delivers posture + knob true; `--no-ci-posture` skips + knob false | per flag | AC-013 |
| Regression trap | upgrade-project on opted-out project re-delivers nothing, leaves consumer hooks alone | untouched | AC-013 |
| Golden path | harness preflight reads both state files before first write; full workflow produces zero read-first tool failures | zero failures | AC-014 |

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Log | `branch_guard` deny reason | hook stderr JSON `{decision, reason}` | explain blocked workflow start |
| Log | `harness/<slug>.log` `autonomous landing` line | timestamped transition | audit no-yield landings |
| Log | `workflow.json → novelty/track_reason` | durable fields | audit triage leanness |
| Log | checker-fanout merged verdict | `BLOCKED` findings incl. `deferral_untagged` | gate-A surface |
| Metric | test suite + audit-baseline exit codes | CI check | AC-011/012 enforcement |

## Rollout

### Prerequisites

| # | Prerequisite | enforced-by |
|---|---|---|
| 1 | audit-baseline green (counts/roster/cap/mirror reconciled) before any child merges | AC-011 |
| 2 | full test suite green per child commit | AC-012 |

- **Feature flag**: `ci_posture.enabled` (J2, template default `true`, CLI opt-out) — the only knob; other behavior changes ride constitution + config defaults; slice C activates only under `git.workflow_model: "github-flow"` (this repo runs `direct-to-main`, so gate C behavior here is unchanged until the model is switched).
- **Migration order**: per-slice child commits in dependency order (B → C share `common.mjs`; J1 → J2; A, DEF, G, H, I, K independent). Additive JSON shapes need no data migration.
- **Canary**: the first post-port workflow in this repo exercises D/E/F live (introduction-workflow pattern — this epic itself predates the new defaults).

## Rollback

- **Kill-switch**: revert the child commit (each slice is one commit; no cross-slice data). Slice E flip reverts by restoring `workflow-defaults.mjs` + XI.3 in one commit.
- **Signal to roll back**: audit-baseline FAIL, suite red, or a hook misfire (e.g. branch_guard denying on a non-github-flow repo) observed in the next workflow — all visible within one write/commit cycle.

## Archive plan

- Defaults *(automatic)*: intake, brief, scout, research, spec, spec approval, security reports.
- Extras *(list any non-default files)*:
  - *(none)*

## Decisions (gate-A review, maintainer, 2026-07-03)

| # | Question | Decision | Owner |
|---|---|---|---|
| 1 | Track + slices | epic confirmed; D+E+F merged into one doctrine slice; J split J1/J2; K added → **10 slices: A B C DEF G H I J1 J2 K** | maintainer |
| 2 | Brainstorm read-time default | **NO flip** — absent `skip_brainstorm` keeps meaning run; opt-in only via triage's explicit flag | maintainer — verbatim: "no flag = run" |
| 3 | New skills | both land, `owner: baseline`, counts 46→48 | maintainer |
| 4 | Repo visibility | PUBLIC (verified) → J1 ruleset fully live | fact |
| 5 | CI posture shipping | ship to consumers default-on with CLI opt-out; init/upgrade-project own the tailoring | maintainer — verbatim: "ship with a flag to skip in cli … the init-project and upgrade-project commands can handle this ship logic" |
| 6 | `gh`-absent fail-safe | yield to gate C as today | maintainer |

## Open questions

- *(none — all six gate-A review questions resolved above)*
