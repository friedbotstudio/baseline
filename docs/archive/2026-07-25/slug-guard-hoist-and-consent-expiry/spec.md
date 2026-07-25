# Slug-guard hoist + workflow-scoped consent expiry

## Context

| Input | Path |
|---|---|
| Intake | *(excepted — `/triage` routed this at `spec-entry`)* |
| BRD *(if any)* | *(none)* |
| Scout *(if any)* | *(excepted)* |
| Research *(if any)* | *(excepted)* |

Upstream source of record (roadmap + memory, re-verified on disk at `ea618e9`):

| Source | Key | Claim |
|---|---|---|
| Roadmap T2 | `docs/roadmap-execution-plan.md:104` | Hoist a single slug validator once a third caller appears |
| Roadmap T9 | `docs/roadmap-execution-plan.md:111` | Consent expiry on a landing longer than the TTL |
| Backlog | `hoist-single-slug-validator-at-third-use-9f4f` | REJECT, never normalize; the design call is the work |
| Backlog | `timing-path-builders-lack-assert-safe-slug-a8d2` | `timing.mjs:50-51` build paths from `wf.slug` unguarded |
| Backlog | `commit-consent-expiry-long-landing-7af6` | `/commit` archives `workflow.json` before committing |

**Write set**: `.claude/hooks/lib/slug.mjs`, `.claude/hooks/lib/consent-decision.mjs`, `.claude/hooks/lib/timing.mjs`, `.claude/hooks/git_commit_guard.mjs`, `.claude/skills/harness/plan-store.mjs`, `.claude/skills/harness/consolidate-open-questions.mjs`, `.claude/skills/harness/checkers/ac-conformance.mjs`, `.claude/skills/triage/seed-tasklist.mjs`, `.claude/skills/whatsnew/fragment-writer.mjs`, `.claude/project.json`, `src/project.template.json`, `tests/**` — touches `.claude/hooks/**`, which no `diagram_profiles` entry covers, so the **full C4 set** applies.

## Goal

One shared slug predicate guards every path built from a slug, and a workflow-scoped `/grant-commit` survives a landing longer than the ad-hoc time window without weakening the ad-hoc guarantee.

## Non-goals

- **Not** normalizing slugs anywhere. `canonicalSlug` stays a normalizer for its existing display/marker callers and never becomes the validator.
- **Not** raising the ad-hoc `consent.commit_ttl_seconds`. The 900s window on a no-workflow commit is unchanged.
- **Not** touching `/approve-direction` or `/approve-swarm` consent. Gate C only.
- **Not** re-curating memory `scope:` tags (roadmap T8) — separate work, no code overlap.

## Design

Diagrams are the contract. Prose is only for things a diagram cannot say.

### C4 — System context

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — baseline slug + consent guards
Person(dev, "Developer", "runs a workflow and grants commit consent")
System(baseline, "Claude Code baseline harness", "hooks + skills enforcing the 11-phase pipeline")
System_Ext(git, "git", "working tree, branch topology, commit")
System_Ext(fs, "Repository filesystem", "state, archive bundles, docs")
Rel(dev, baseline, "runs /harness, /grant-commit")
Rel(baseline, git, "inspects branch, runs commit")
Rel(baseline, fs, "reads state + archive, writes plan/timing")
@enduml
```

### C4 — Container

```plantuml
@startuml
!include <C4/C4_Container>
title Container — enforcement surfaces under change
System_Boundary(baseline, "Baseline harness") {
  Container(hooks, "PreToolUse/PostToolUse hooks", "Node ESM", "git_commit_guard, phase_timer")
  Container(hooklib, "hooks/lib foundation", "Node ESM", "shared, dependency-free primitives")
  Container(skills, "Phase skills", "Node ESM + SKILL.md", "harness, triage, whatsnew")
  ContainerDb(state, "State + archive", "JSON/JSONL on disk", "workflow.json, consent tokens, plans, timing")
}
Rel(hooks, hooklib, "imports predicates + decisions")
Rel(skills, hooklib, "imports predicates")
Rel(hooks, state, "reads consent token, reads workflow/archive")
Rel(skills, state, "reads/writes plan + tasklist state")
@enduml
```

### C4 — Component (changed containers only)

```plantuml
@startuml
!include <C4/C4_Component>
title Component — hooks/lib foundation after the hoist
Container_Boundary(hooklib, "hooks/lib foundation") {
  Component(slug, "slug.mjs", "Node ESM", "NEW — isSafeSlug predicate + assertSafeSlug thrower")
  Component(consent, "consent-decision.mjs", "Node ESM", "CHANGED — archive-aware resolveWorkflow, dual TTL")
  Component(timing, "timing.mjs", "Node ESM", "CHANGED — guarded path builders")
  Component(common, "common.mjs", "Node ESM", "UNCHANGED — canonicalSlug stays a normalizer")
}
Component(guard, "git_commit_guard.mjs", "Node ESM", "CHANGED — passes token slug, reads workflow TTL")
Component(planstore, "plan-store.mjs", "Node ESM", "CHANGED — re-exports assertSafeSlug")
Rel(consent, slug, "validates before archive path build")
Rel(timing, slug, "validates before path build")
Rel(guard, consent, "decideCommitConsent")
Rel(planstore, slug, "re-exports")
@enduml
```

### Data model — class diagram

No database. The entities are the module surfaces and the on-disk consent token shape.

```plantuml
@startuml
title Data model — slug guard + consent decision surfaces

class SlugModule <<new>> {
  +SLUG_RE: RegExp
  +MAX_SLUG_LEN: int = 200
  +isSafeSlug(slug): boolean
  +assertSafeSlug(slug, label): string
}

class CommitConsentToken {
  +slug: string
  +epoch: int
}

class WorkflowContext {
  +present: boolean
  +slug: string
  +readable: boolean
  +source: string
}

class ConsentDecision {
  +allow: boolean
  +mode: string
  +reason: string
}

class TtlPolicy <<new>> {
  +commit_ttl_seconds: int = 900
  +workflow_ttl_seconds: int = 14400
}

SlugModule <.. WorkflowContext : validates slug before path build
CommitConsentToken "1" --> "1" ConsentDecision : decideCommitConsent
WorkflowContext "1" --> "1" ConsentDecision : scopes
TtlPolicy "1" --> "1" ConsentDecision : selects TTL by mode
@enduml
```

#### Migration DDL

No database and no schema migration. The only persisted-shape change is additive config:

```sql
-- forward: additive keys in .claude/project.json -> consent
--   consent.workflow_ttl_seconds = 14400   (absent => read-time default 14400)
-- reverse: delete the key; slug-mode TTL falls back to the same read-time default.
-- No stored rows exist, so neither direction rewrites data.
```

`WorkflowContext.source` is an in-memory field only — it is never serialized to a state file.

### Behavior — sequence per AC

```plantuml
@startuml
title Behavior #1 — AC-001 shared predicate rejects, never normalizes
actor Caller
participant "slug.mjs" as S

Caller -> S : isSafeSlug("../../etc/passwd")
S --> Caller : false
Caller -> S : assertSafeSlug("../../etc/passwd", "plan-store")
alt unsafe charset
  S --> Caller : throw Error("plan-store: refusing ... unsafe slug")
else over MAX_SLUG_LEN
  S --> Caller : throw Error("plan-store: ... length 201 > 200")
else safe
  S --> Caller : returns slug unchanged
end
note right of S : never returns a REPAIRED slug\nno canonicalSlug call on this path
@enduml
```

```plantuml
@startuml
title Behavior #2 — AC-002/AC-003 each call site keeps its own failure mode
actor Caller
participant "call site" as C
participant "slug.mjs" as S

Caller -> C : invoke with bad slug
C -> S : isSafeSlug / assertSafeSlug
S --> C : false / throw
alt plan-store, whatsnew fragment-writer
  C --> Caller : throw named Error
else consolidate-open-questions, seed-tasklist
  C --> Caller : stderr message + exit 2
else ac-conformance checker
  C --> Caller : {findings: []} (silent, fail-open)
end
note right of C : one predicate, three failure modes\nthe shared thing is the PREDICATE
@enduml
```

```plantuml
@startuml
title Behavior #3 — AC-004 timing path builders guarded without breaking never-throws
participant phase_timer
participant "timing.mjs" as T
participant "slug.mjs" as S
database "state/timing" as D

phase_timer -> T : stampFromWorkflow(rootDir)
T -> T : read workflow.json -> wf.slug
group try
  T -> S : assertSafeSlug(wf.slug, "timing")
  alt slug safe
    S --> T : slug
    T -> D : appendFileSync(timing/<slug>.jsonl)
    D --> T : ok
  else slug unsafe
    S --> T : throw
    T -> T : catch; skip stamping
  end
end
T --> phase_timer : returns (never throws)
note right of T : no write is attempted before validation\nhook contract "Idempotent; never throws" preserved
@enduml
```

```plantuml
@startuml
title Behavior #4 — AC-005 archived-bundle slug resolution at gate C
participant "/commit" as CM
participant git_commit_guard as G
participant "consent-decision.mjs" as CD
participant "slug.mjs" as S
database "filesystem" as FS

CM -> FS : move workflow.json -> docs/archive/<date>/<slug>/
CM -> G : Bash "git commit ..."
G -> FS : read .claude/state/commit_consent
G -> CD : resolveWorkflow(root, token.slug)
CD -> FS : stat .claude/state/workflow.json
FS --> CD : ENOENT
alt token carries a slug
  CD -> S : isSafeSlug(token.slug)
  S --> CD : true
  CD -> FS : find docs/archive/*/<token.slug>/workflow.json
  alt archived bundle found
    FS --> CD : bundle path
    CD --> G : {present:true, slug, readable:true, source:"archive"}
  else no bundle
    FS --> CD : none
    CD --> G : {present:false, slug:"", readable:true}
  end
else token has no slug
  CD --> G : {present:false, slug:"", readable:true}
end
@enduml
```

```plantuml
@startuml
title Behavior #5 — AC-006/AC-007 TTL selected by mode
participant git_commit_guard as G
participant "consent-decision.mjs" as CD

G -> CD : decideCommitConsent({token, workflow, now, ttl:900, workflowTtl:14400})
alt workflow absent (ad-hoc commit)
  CD -> CD : age = now - token.epoch
  alt age > 900
    CD --> G : {allow:false, mode:"time-window", reason:"consent expired"}
  else
    CD --> G : {allow:true, mode:"time-window"}
  end
else workflow present, slug matches token
  CD -> CD : age = now - token.epoch
  alt age > 14400
    CD --> G : {allow:false, mode:"slug", reason:"workflow consent expired"}
  else
    CD --> G : {allow:true, mode:"slug"}
  end
else workflow present, slug mismatch or unreadable
  CD --> G : {allow:false, mode:"slug"}
end
note right of CD : ad-hoc window UNCHANGED at 900s\nonly the slug-bound branch gets the longer TTL
@enduml
```

### State — core entity

The consent token's effective authority is a small state machine.

```plantuml
@startuml
title State — commit consent authority
[*] --> Absent
Absent --> AdHoc : /grant-commit, no active workflow
Absent --> WorkflowScoped : /grant-commit inside a workflow
AdHoc --> Expired : age > commit_ttl_seconds (900)
WorkflowScoped --> WorkflowScoped : workflow.json archived, bundle resolves
WorkflowScoped --> Expired : age > workflow_ttl_seconds (14400)
WorkflowScoped --> Denied : token slug != live slug
Expired --> [*]
Denied --> [*]
@enduml
```

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — after the hoist
left to right direction
[git_commit_guard] --> [consent-decision]
[consent-decision] --> [slug]
[phase_timer] --> [timing]
[timing] --> [slug]
[plan-store] --> [slug]
[consolidate-open-questions] --> [slug]
[ac-conformance] --> [slug]
[seed-tasklist] --> [slug]
[fragment-writer] --> [slug]
[checker-fanout] --> [plan-store]
[pre-implementation-gate] --> [plan-store]
[approval-provenance] --> [plan-store]
@enduml
```

Acyclic: `slug.mjs` is a leaf and imports nothing from the repo. The three existing `plan-store` consumers keep importing `assertSafeSlug` from `plan-store`, which re-exports — so no consumer edge is rewired.

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Function | `isSafeSlug(slug)` | `unknown` | `boolean` | never throws | yes (pure) |
| Function | `assertSafeSlug(slug, label?)` | `unknown`, `string` (default `"slug"`) | the slug unchanged | `Error` on non-string, charset miss, or `length > 200` | yes (pure) |
| Const | `SLUG_RE` | — | `/^[a-z0-9][a-z0-9-]*$/` | — | — |
| Const | `MAX_SLUG_LEN` | — | `200` | — | — |
| Function | `plan-store.assertSafeSlug(slug)` | `unknown` | slug | `Error` prefixed `plan-store:` | yes (re-export, label-bound) |
| Function | `resolveWorkflow(rootDir, tokenSlug?)` | `string`, `string?` | `{present, slug, readable, source}` | never throws | yes |
| Function | `decideCommitConsent({token, workflow, now, ttl, workflowTtl})` | object | `{allow, mode, reason}` | never throws | yes (pure) |
| Config | `consent.workflow_ttl_seconds` | int seconds | — | absent/invalid → `14400` | — |

`resolveWorkflow`'s second parameter is optional; called with one argument it behaves exactly as today (no archive lookup), so any caller not yet updated is unaffected.

### Libraries and versions

| Library@version | Purpose | Key APIs | Confirmed against current docs |
|---|---|---|---|
| Node.js built-in `node:fs` | state + archive reads | `readFileSync`, `existsSync`, `readdirSync`, `statSync` | yes — Node LTS built-in, already used repo-wide; no third-party surface |
| Node.js built-in `node:path` | path composition | `join` | yes — same |

No third-party dependency is added. The baseline's zero-runtime-dep posture is unchanged, so the Article VI.5 current-docs mandate is satisfied by the Node built-in docs rather than a `context7` lookup.

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| A | Route every slug site through `canonicalSlug` to consolidate | It is a **normalizer**. It would silently redirect a traversing slug to a different path and mask the bug repo-wide — the exact failure `-9f4f` warns against |
| B | One `assertSafeSlug` for all five sites, everyone throws | Erases three deliberate failure modes: the CLI sites owe a clean stderr + exit 2, and `ac-conformance` is a fail-open checker that must not crash the fan-out |
| C | Put `slug.mjs` under `.claude/skills/harness/` | Inverts layering. `hooks/lib` is the lower layer (skills already import `hooks/lib/tier-dial.mjs`); a hook importing from skills would be a new upward edge |
| D | Raise `consent.commit_ttl_seconds` globally (backlog option b) | Weakens the ad-hoc guarantee for every no-workflow commit to buy a fix only workflow landings need |
| E | Archive lookup alone (backlog options a/c, unmodified) | **Insufficient.** The TTL check fires in slug mode too (`consent-decision.mjs:64-65`), so restoring slug mode still expires at 900s. The archive lookup must be paired with a slug-mode TTL |
| F | Drop the TTL entirely in slug mode | An archived bundle persists forever, so a stale token would grant permanent consent for that slug. The authority must still decay |

**Design call 1 settled** — hoist the **predicate**, not the failure mode. `slug.mjs` exports `isSafeSlug` (pure boolean) plus `assertSafeSlug` (throws, label-parameterized). Each of the six sites keeps the failure behavior its layer owes its caller. `plan-store` re-exports `assertSafeSlug` label-bound so its three existing importers and `tests/plan-store-slug-length.test.mjs` are untouched.

**Design call 2 settled** — neither listed candidate is sufficient alone (Alt E). Take **(c) + a mode-scoped (b)**: resolve the workflow slug from the archived bundle when the live file is absent, *and* give slug-mode its own longer `workflow_ttl_seconds`. The archive lookup is bounded by the token's own slug, so it can never authorize a workflow the token did not already name.

## Design calls

*(none)* — the write set does not intersect `project.json → tdd.ui_globs`; there is no UI surface in this change.

## Acceptance criteria

| ID | Criterion (given / when / then) | Kind | Upstream AC | Sequence |
|---|---|---|---|---|
| AC-001 | given a slug failing `SLUG_RE` or exceeding 200 chars, when `isSafeSlug`/`assertSafeSlug` runs, then it returns `false` / throws a named `Error`, and never returns a modified slug | behavior | T2 / `-9f4f` | §Behavior #1 |
| AC-002 | given `tests/plan-store-slug-length.test.mjs` importing `assertSafeSlug` from `plan-store.mjs`, when the hoist lands, then the import still resolves and the length error still matches `/length\|\b200\b/i` | behavior | T2 / `-9f4f` | §Behavior #2 |
| AC-003 | given a bad slug at each of the five sites, when each runs, then `plan-store` and `fragment-writer` throw, `consolidate-open-questions` and `seed-tasklist` write stderr and exit 2, and `ac-conformance` returns `{findings: []}` | behavior | T2 / `-9f4f` | §Behavior #2 |
| AC-004 | given `workflow.json` carrying a traversing slug, when `stampFromWorkflow` runs, then no file is appended outside `.claude/state/timing/` and the call still returns without throwing | behavior | `-a8d2` | §Behavior #3 |
| AC-005 | given the live `workflow.json` is absent but `docs/archive/<date>/<slug>/workflow.json` exists and the consent token names that slug, when `resolveWorkflow` runs, then it returns `{present: true, slug, source: "archive"}` | behavior | T9 / `-7af6` | §Behavior #4 |
| AC-006 | given a workflow-scoped token 1800s old (> 900s, < 14400s) and a matching live-or-archived slug, when `decideCommitConsent` runs, then it returns `{allow: true, mode: "slug"}` | behavior | T9 / `-7af6` | §Behavior #5 |
| AC-007 | given no workflow context and a token 1000s old, when `decideCommitConsent` runs, then it returns `{allow: false, mode: "time-window"}` — the ad-hoc 900s window is unchanged | behavior | T9 / `-7af6` | §Behavior #5 |
| AC-008 | given the shipped tree, when a scan asserts no module under the write set imports `canonicalSlug` for validation, then zero matches are found outside `common.mjs`'s own definition and its existing display/marker callers | preflight | `-9f4f` caveat | §Behavior #1 |
| AC-009 | given a token whose slug names a workflow with no archived bundle and no live `workflow.json`, when `resolveWorkflow` runs, then it returns `{present: false}` and the decision falls to the 900s ad-hoc window | error-mapping | T9 / `-7af6` | §Behavior #4 |
| AC-010 | given a workflow-scoped token older than 14400s, when `decideCommitConsent` runs, then it returns `{allow: false, mode: "slug"}` — archived-bundle authority still decays | behavior | Alt F | §Behavior #5 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | `isSafeSlug("slug-guard-hoist-and-consent-expiry")` | `true` | AC-001 |
| Golden path | workflow-scoped token 1800s old, archived bundle present | `{allow: true, mode: "slug"}` | AC-005, AC-006 |
| Input boundary | slug at exactly 200 chars / 201 chars | accepted / named length error | AC-001, AC-002 |
| Input boundary | `""`, `"-lead"`, `"Upper"`, `"under_score"`, `"a/b"`, `"../x"` | all rejected | AC-001 |
| Contract violation | each of the five sites given `"../../etc/passwd"` | three distinct failure modes, no path built | AC-003 |
| Contract violation | `stampFromWorkflow` with traversing `wf.slug` | no write outside `state/timing/`, no throw | AC-004 |
| Concurrency / ordering | archive lookup while a second workflow's bundle exists for a different slug | only the token's own slug resolves | AC-005 |
| Failure mode | `docs/archive/` absent or unreadable | `{present: false}`, falls to time-window, no throw | AC-009 |
| Failure mode | token 20000s old, slug matches | `{allow: false, mode: "slug"}` | AC-010 |
| Regression trap | ad-hoc commit, no workflow, token 1000s old | still denied at 900s | AC-007 |
| Regression trap | grep the write set for `canonicalSlug` used as a validator | zero matches | AC-008 |
| Regression trap | `checker-fanout`, `pre-implementation-gate`, `approval-provenance` import `assertSafeSlug` from `plan-store` | still resolve | AC-002 |

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Log | `git_commit_guard ALLOWED consent (slug)` | existing `logLine`, now carries `source=live\|archive` | audit which resolution path granted consent |
| Log | `git_commit_guard BLOCKED consent (slug)` | existing `logLine` + reason | distinguish expiry from slug mismatch |
| Log | `timing: skipped stamp (unsafe slug)` | stderr line from the catch in `stampFromWorkflow` | surface a traversing slug without crashing the hook |

No metric or alarm: this is a local developer-tool guard with no service to page on.

## Rollout

### Prerequisites

| # | Prerequisite | enforced-by |
|---|---|---|
| 1 | No module in the write set uses `canonicalSlug` as a validator | AC-008 |
| 2 | A token naming a workflow with no archived bundle degrades to the ad-hoc window rather than failing open | AC-009 |

- **Feature flag**: none. The slug hoist is a pure refactor of an existing guard, and the consent change is a bugfix to a gate that is already mandatory — a flag would mean shipping the known-broken path as an option.
- **Migration order**: 1 add `slug.mjs` + tests → 2 re-point the five sites → 3 guard `timing.mjs` → 4 archive-aware `resolveWorkflow` + dual TTL → 5 config key in `project.json` + `src/project.template.json`.
- **Canary**: none applicable (no deployed surface). The first real canary is this workflow's own `/commit`, which exercises AC-005 and AC-006 directly.

## Rollback

- **Kill-switch**: `git revert` of the single commit. `consent.workflow_ttl_seconds` may also be set to `900` in `.claude/project.json` to restore the old effective expiry without a code change.
- **Signal to roll back**: any `git commit` on a protected branch denied with a `mode: "slug"` reason while a valid fresh `/grant-commit` exists — visible immediately in `.claude/state/logs/` on the first commit attempt, well inside 5 minutes.

## Archive plan

- Defaults *(automatic)*: spec, spec-rendered/, spec approval, security report, workflow.json.
- Extras *(list any non-default files)*:
  - *(none)*

## Open questions

- *(none)* — both design calls are settled above under **Alternatives considered**. The one judgment worth flagging to the reviewer at gate A is the `workflow_ttl_seconds` default of **14400s (4h)**: it must exceed a realistic long landing while still decaying an archived-bundle-backed token. Lower it to 7200 if 4h reads as too generous; the value is config, not code.
