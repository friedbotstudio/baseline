# Upgrade no-replay prompts — NEVER_TOUCH for runtime state + reconciliation marker

## Context

| Input | Path |
|---|---|
| Intake | `docs/intake/upgrade-no-replay-prompts.md` |
| BRD *(if any)* | — |
| Scout *(if any)* | `docs/scout/upgrade-no-replay-prompts.md` |
| Research *(if any)* | `docs/research/upgrade-no-replay-prompts.md` |

## Goal

`create-baseline upgrade` against an unchanged baseline produces zero prompts: runtime-state files (`_pending.md`, `_resume.md`) are preserved silently as NEVER_TOUCH, and files reconciled via `/upgrade-project` are not re-staged on subsequent upgrade runs until the upstream template's hash for that file actually changes.

## Non-goals

- Do not change the v3 shipped-manifest schema's existing fields (`sha256`, `tier`). Additive only.
- Do not fix scout landmine #1 (the v2/v3 shape mismatch at `.claude/.baseline-manifest.json` between `install.js:writeBaselineManifest` and `merge.js:154-157`). Carved out per research recommendation; tracked as a separate intake. This spec works around the inconsistency by introducing the reconciliation marker as a separate file rather than extending `.baseline-manifest.json`.
- Do not redesign how `/upgrade-project` performs three-way reconciliation. Its semantic-merge logic stays untouched; only its terminal "delete stage" step gains a marker-write sibling.
- Do not add network round-trips. The marker is written from local state available at reconciliation time.
- Do not change `audit-baseline`'s reading of `.claude/manifest.json` (the shipped v3 manifest). That file is unchanged by this work.
- Do not change `cli-copy-review` skill behavior. CLI copy lives in `src/cli/tui/upgrade.js`; copy changes (if any) get reviewed in Phase 10.6.5 of this workflow, not adjudicated here.

## Design

Diagrams are the contract. Prose only for what a diagram cannot say.

### C4 — System context

Who runs upgrade, and which external systems the CLI depends on.

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — create-baseline upgrade
Person(user, "Baseline consumer", "runs npx @friedbotstudio/create-baseline upgrade")
System(cli, "create-baseline CLI", "three-tier upgrade + manifest tracking")
System(claudecode, "Claude Code", "executes /upgrade-project skill")
System_Ext(npm, "npm registry", "supplies prior-baseline tarballs for BASE recovery")

Rel(user, cli, "upgrade [target]")
Rel(cli, npm, "libnpmpack: fetch prior baseline version")
Rel(user, claudecode, "/upgrade-project")
Rel(claudecode, cli, "writes reconciliation marker (NEW)")
@enduml
```

### C4 — Container

Deployable units and their communication paths.

```plantuml
@startuml
!include <C4/C4_Container>
title Container — create-baseline CLI + /upgrade-project skill
System_Boundary(cli, "create-baseline CLI") {
  Container(bin, "bin/cli.js", "Node CLI", "parseArgs + dispatch")
  Container(install, "install.js", "Node ESM", "fresh install + NEVER_TOUCH check")
  Container(merge, "merge.js", "Node ESM", "three-way merge + reconciliation-marker consume (NEW)")
  Container(tiers, "upgrade-tiers.js", "Node ESM", "tier dispatch + stage writer")
  Container(doctor, "doctor.js", "Node ESM", "manifest-drift report + marker exclusion (NEW)")
  Container(marker, "reconciliation-marker.js", "Node ESM", "NEW: read/write .baseline-reconciliations.json")
  ContainerDb(targetfs, "<target>/.claude/", "filesystem", "manifest + stage + reconciliations + memory")
}
System_Boundary(skill, "/upgrade-project skill") {
  Container(skillmd, "SKILL.md", "Claude Code skill", "reconcile staged files + write marker (CHANGED)")
}

Rel(bin, install, "install path")
Rel(bin, merge, "upgrade path")
Rel(merge, tiers, "dispatch customized files")
Rel(merge, marker, "read marker for NOOP shortcut")
Rel(skillmd, marker, "write marker after RECONCILED")
Rel(install, targetfs, "writes .baseline-manifest.json")
Rel(merge, targetfs, "writes .baseline-manifest.json + reads .baseline-reconciliations.json")
Rel(marker, targetfs, "RW .baseline-reconciliations.json")
Rel(doctor, targetfs, "reads .baseline-manifest.json")
Rel(skillmd, targetfs, "writes LOCAL + .baseline-reconciliations.json")
@enduml
```

### C4 — Component (changed containers only)

`merge.js` gains a marker-consult step. `reconciliation-marker.js` is new. `doctor.js` gains an exclusion. `install.js` and `build-manifest.mjs` get NEVER_TOUCH list expansions.

```plantuml
@startuml
!include <C4/C4_Component>
title Component — merge.js with marker-consult
Container_Boundary(merge, "merge.js") {
  Component(twm, "threeWayMerge", "function", "per-file classification loop")
  Component(nevertouch, "NEVER_TOUCH check", "branch", "src/cli/install.js:13-17 list (EXPANDED)")
  Component(specialmerge, "SPECIAL_MERGE check", "branch", "deep-merge .mcp.json")
  Component(noop, "tgtHash === newHash", "branch", "already current")
  Component(unchangedsince, "tgtHash === oldHash", "branch", "untouched since last install")
  Component(markercheck, "NEW: reconciliation-marker check", "branch", "newHash matches recorded reconciliation_against → NOOP")
  Component(dispatch, "dispatchCustomized", "function", "route to tier dispatch")
  Component(prune, "prune-or-preserve", "branch", "upstream-removed handling")
}
Rel(twm, nevertouch, "1st")
Rel(twm, specialmerge, "2nd")
Rel(twm, noop, "3rd")
Rel(twm, unchangedsince, "4th")
Rel(twm, markercheck, "5th — NEW")
Rel(twm, dispatch, "6th — only if marker absent or mismatched")
Rel(twm, prune, "fallback")
@enduml
```

### Data model — class diagram

The reconciliations file's schema, and the marker module's exported surface.

```plantuml
@startuml
title Data model — reconciliation marker
class ReconciliationsFile {
  +schema_version: int = 1
  +reconciliations: Map<rel, ReconciliationEntry>
}
class ReconciliationEntry {
  +baseline_version: string
  +reconciled_against_template_sha: string <<sha256 hex>>
  +reconciled_at: string <<ISO-8601 UTC>>
}
class MarkerModule <<new>> {
  +readMarker(target): ReconciliationsFile | null
  +recordReconciliation(target, rel, baseline_version, template_sha): void
  +matchesReconciledHash(marker, rel, template_sha): boolean
}
ReconciliationsFile "1" *-- "many" ReconciliationEntry
MarkerModule ..> ReconciliationsFile : reads/writes
@enduml
```

#### Migration DDL

Not applicable — no relational schema. The on-disk JSON file is the only "schema." Forward and reverse migrations:

```text
-- forward
Create file <target>/.claude/.baseline-reconciliations.json with:
  {"schema_version": 1, "reconciliations": {}}
Written lazily by reconciliation-marker.js on first recordReconciliation() call.
Absent file is the v0 state and is interpreted as "no reconciliations recorded."

-- reverse
Delete <target>/.claude/.baseline-reconciliations.json
merge.js silently falls back to "no marker" (treats every file as today).
No data loss; the next /upgrade-project run will re-populate.
```

### Behavior — sequence per AC

#### Behavior #1 — NEVER_TOUCH preserves _pending.md / _resume.md (AC-001, AC-002)

```plantuml
@startuml
title Behavior #1 — NEVER_TOUCH preserves runtime-state files
actor User
participant "create-baseline upgrade" as CLI
participant "merge.js\nthreeWayMerge" as Merge
database "<target>/.claude/\nmemory/_pending.md" as Target

User -> CLI : upgrade .
CLI -> Merge : threeWayMerge(templateDir, target, oldM, newM)
loop per file in allPaths
  Merge -> Merge : rel === ".claude/memory/_pending.md"?
  alt rel in NEVER_TOUCH (EXPANDED list includes _pending.md, _resume.md)
    Merge -> Target : pathExists?
    Target --> Merge : true
    Merge --> CLI : action = NEVER_TOUCH_PRESERVE (no prompt, no write)
  else
    note right of Merge: existing classification continues
  end
end
CLI --> User : "Applied N updates; kept your version on 0 customized files"
@enduml
```

#### Behavior #2 — Reconciliation marker NOOPs same-hash post-reconciliation file (AC-003)

```plantuml
@startuml
title Behavior #2 — Marker prevents re-stage when template hash matches
actor User
participant "create-baseline upgrade" as CLI
participant "merge.js" as Merge
participant "reconciliation-marker.js\nreadMarker / matchesReconciledHash" as Marker
database "<target>/.claude/\n.baseline-reconciliations.json" as MarkerFile

User -> CLI : upgrade . (run after prior /upgrade-project reconciled seed.md)
CLI -> Marker : readMarker(target)
Marker -> MarkerFile : read JSON
MarkerFile --> Marker : {reconciliations: {"docs/init/seed.md": {baseline_version, reconciled_against_template_sha: X, reconciled_at}}}
Marker --> CLI : marker object
CLI -> Merge : threeWayMerge(..., {markerCtx: marker})
loop per file
  Merge -> Merge : rel === "docs/init/seed.md"
  Merge -> Merge : NEVER_TOUCH? no\nSPECIAL_MERGE? no\ntgtHash === newHash? no (user has §16)\ntgtHash === oldHash? no
  Merge -> Marker : matchesReconciledHash(marker, rel, newHash)
  alt newHash === reconciliation_against_template_sha (X === X)
    Marker --> Merge : true
    Merge --> CLI : action = NOOP "marker matches; user-reconciled-against this template"
  else newHash !== reconciliation_against (real upstream change)
    Marker --> Merge : false
    Merge -> Merge : continue to dispatchCustomized (existing flow)
  end
end
CLI --> User : "0 prompts" (matched) OR stage emitted (mismatched)
@enduml
```

#### Behavior #3 — Real upstream change still stages (AC-004)

```plantuml
@startuml
title Behavior #3 — Genuine template change still surfaces
actor User
participant "create-baseline upgrade" as CLI
participant "merge.js" as Merge
participant "reconciliation-marker.js" as Marker
participant "upgrade-tiers.js\ndispatchByTier" as Tiers

User -> CLI : upgrade . (new baseline version; seed.md changed upstream)
CLI -> Marker : readMarker(target)
Marker --> CLI : {reconciliations: {"docs/init/seed.md": {..., reconciled_against_template_sha: X}}}
CLI -> Merge : threeWayMerge(..., {markerCtx: marker})
Merge -> Marker : matchesReconciledHash(marker, "docs/init/seed.md", newHash=Y)
Marker --> Merge : false (Y !== X)
Merge -> Tiers : dispatchByTier("docs/init/seed.md", "SEMANTIC", ctx)
Tiers -> Tiers : writeStage(ctx, rel, base, incoming, local)
Tiers --> Merge : SEMANTIC_MERGE_STAGED
Merge --> CLI : action surfaced
CLI --> User : "Pending semantic-merge stage at <ts>" → user runs /upgrade-project
@enduml
```

#### Behavior #4 — /upgrade-project writes marker post-reconciliation (AC-003 source)

```plantuml
@startuml
title Behavior #4 — Skill records reconciliation after RECONCILED
actor User
participant "Claude Code" as CC
participant "/upgrade-project skill" as Skill
participant "reconciliation-marker.js\nrecordReconciliation" as Marker
database "<target>/.claude/state/upgrade/<ts>/" as Stage
database "<target>/.claude/\n.baseline-reconciliations.json" as MarkerFile

User -> CC : /upgrade-project
CC -> Skill : invoke
Skill -> Stage : read manifest.json + BASE/INCOMING/LOCAL artifacts
Skill -> Skill : reason through three-way delta in main context
Skill -> Stage : write reconciled bytes to LOCAL (existing)
alt per-file RECONCILED (not NEEDS_USER_INPUT, not dry-run)
  Skill -> Marker : recordReconciliation(target, rel, baseline_version_to, incoming_sha256)
  Marker -> MarkerFile : read existing (or null)
  Marker -> MarkerFile : write merged {reconciliations: {..., rel: {baseline_version, template_sha, reconciled_at: now}}}
end
Skill -> Stage : delete stage directory (existing)
Skill --> CC : "RECONCILED" report
CC --> User : per-file report + marker-written count
@enduml
```

#### Behavior #5 — Legacy install (no marker file) graceful onboarding (AC-005)

```plantuml
@startuml
title Behavior #5 — First post-fix upgrade preserves customizations without marker
actor User
participant "create-baseline upgrade" as CLI
participant "merge.js" as Merge
participant "reconciliation-marker.js\nreadMarker" as Marker

User -> CLI : upgrade . (first run after this fix lands; no .baseline-reconciliations.json yet)
CLI -> Marker : readMarker(target)
Marker --> CLI : null (file absent)
CLI -> Merge : threeWayMerge(..., {markerCtx: null})
loop per file
  Merge -> Merge : marker null → matchesReconciledHash returns false vacuously
  Merge -> Merge : fall through to existing dispatchCustomized flow
end
note right of CLI: Behavior identical to pre-fix run for marker-relevant files.\nUser still prompted as before (or routed to tier dispatch).\nNo customizations destroyed.
CLI --> User : same prompt set as pre-fix
User -> User : runs /upgrade-project (now writes marker)
User -> CLI : upgrade . (SECOND run)
CLI -> Marker : readMarker(target)
Marker --> CLI : {reconciliations: {...}}
note right of CLI: Second run now silent for marker-recorded files.
CLI --> User : "0 prompts" for marker-matched files
@enduml
```

#### Behavior #6 — Audit + doctor unaffected (AC-006)

```plantuml
@startuml
title Behavior #6 — Audit and doctor preserve semantics
actor User
participant "audit-baseline\naudit.sh" as Audit
participant "doctor\ndoctor.js" as Doctor
database ".claude/manifest.json\n(shipped v3)" as ShippedM
database ".claude/.baseline-manifest.json\n(CLI-written)" as InstalledM
database ".claude/.baseline-reconciliations.json\n(NEW)" as MarkerFile

User -> Audit : bash audit.sh
Audit -> ShippedM : read load_manifest()
ShippedM --> Audit : v3 manifest (unchanged — tier added for _pending/_resume = NEVER_TOUCH)
Audit -> Audit : hash-drift check per file (unchanged logic)
Audit --> User : PASS (no behavior change)

User -> Doctor : create-baseline doctor
Doctor -> InstalledM : read .baseline-manifest.json
InstalledM --> Doctor : entries (untouched)
Doctor -> Doctor : compute added[] by scanning .claude/
note right of Doctor: NEW: .baseline-reconciliations.json explicitly excluded from added scan\n(parallel to existing exclusion of .baseline-manifest.json itself)
Doctor --> User : matched/customized/missing/added report (marker file not in added)
@enduml
```

#### Behavior #7 — NEVER_TOUCH list sync invariant (AC-007)

```plantuml
@startuml
title Behavior #7 — install.js NEVER_TOUCH and build-manifest.mjs NEVER_TOUCH_PATHS stay in sync
participant "tests/never-touch-sync.test.mjs\n(NEW)" as Test
participant "install.js\nNEVER_TOUCH" as Install
participant "build-manifest.mjs\nNEVER_TOUCH_PATHS" as Build

Test -> Install : import { NEVER_TOUCH }
Install --> Test : Object.freeze(['.claude/project.json', '.claude/workflows.jsonl', '.claude/schemas/workflow-track.v1.json', '.claude/memory/_pending.md', '.claude/memory/_resume.md'])
Test -> Build : read text + extract NEVER_TOUCH_PATHS set
Build --> Test : Set(...) with same 5 entries
Test -> Test : assert.deepEqual([...sorted install], [...sorted build])
alt sets equal
  Test --> Test : PASS
else sets diverge
  Test --> Test : FAIL with diff
end
@enduml
```

### State — core entity *(only if stateful)*

The reconciliation marker has a trivial lifecycle (absent → present-and-growing). Per-file entries have their own micro-state.

```plantuml
@startuml
title State — per-file reconciliation entry
[*] --> Absent : file has never been reconciled\nOR fresh install
Absent --> Recorded : /upgrade-project writes recordReconciliation(rel, version, template_sha)
Recorded --> Recorded : subsequent /upgrade-project overwrites with newer template_sha
Recorded --> Recorded : create-baseline upgrade reads marker (no transition)
Recorded --> Absent : user manually deletes .baseline-reconciliations.json (escape hatch)
@enduml
```

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — upgrade-no-replay-prompts changes
left to right direction

[bin/cli.js] --> [src/cli/install.js]
[bin/cli.js] --> [src/cli/merge.js]
[bin/cli.js] --> [src/cli/doctor.js]
[bin/cli.js] --> [src/cli/upgrade-tiers.js]
[bin/cli.js] --> [src/cli/manifest.js]

[src/cli/install.js] --> [src/cli/manifest.js]
[src/cli/install.js] --> [src/cli/mcp.js]

[src/cli/merge.js] --> [src/cli/install.js]
[src/cli/merge.js] --> [src/cli/upgrade-tiers.js]
[src/cli/merge.js] --> [src/cli/manifest.js]
[src/cli/merge.js] --> [src/cli/mcp.js]
[src/cli/merge.js] --> [src/cli/reconciliation-marker.js]

[src/cli/upgrade-tiers.js] --> [src/cli/manifest.js]

[src/cli/doctor.js] --> [src/cli/manifest.js]
[src/cli/doctor.js] --> [src/cli/reconciliation-marker.js]

[src/cli/reconciliation-marker.js] --> [node:fs/promises]
[src/cli/reconciliation-marker.js] --> [node:path]

[scripts/build-manifest.mjs] --> [node:fs]
[scripts/build-manifest.mjs] --> [node:crypto]

[.claude/skills/upgrade-project/SKILL.md] ..> [src/cli/reconciliation-marker.js] : skill invokes via node

[tests/upgrade-reconciliation-marker.test.mjs] --> [src/cli/reconciliation-marker.js]
[tests/upgrade-reconciliation-marker.test.mjs] --> [src/cli/merge.js]
[tests/never-touch-sync.test.mjs] --> [src/cli/install.js]
[tests/never-touch-sync.test.mjs] --> [scripts/build-manifest.mjs]
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| Module | `reconciliation-marker.js → readMarker(target)` | `target: string (absolute path)` | `ReconciliationsFile \| null` | filesystem read errors propagate; ENOENT → returns `null` | yes |
| Module | `reconciliation-marker.js → recordReconciliation(target, rel, baseline_version, template_sha)` | `target, rel, baseline_version, template_sha (sha256 hex)` | `void` | write errors propagate as `MarkerWriteError` | yes (overwrites entry for same `rel`) |
| Module | `reconciliation-marker.js → matchesReconciledHash(marker, rel, template_sha)` | `marker: ReconciliationsFile \| null`, `rel: string`, `template_sha: string` | `boolean` | none — null marker → `false` | yes |
| File | `<target>/.claude/.baseline-reconciliations.json` | per writer | `{schema_version: 1, reconciliations: {rel: {baseline_version, reconciled_against_template_sha, reconciled_at}}}` | malformed JSON → readMarker logs + returns `null` | n/a |
| Skill | `/upgrade-project` post-RECONCILED hook | `target, rel, baseline_version_to, incoming_sha256` | `void` (writes marker via module) | propagates write errors; does NOT roll back the reconciliation | yes |
| List | `src/cli/install.js → NEVER_TOUCH` | n/a (constant) | adds `.claude/memory/_pending.md`, `.claude/memory/_resume.md` | n/a | n/a |
| Set | `scripts/build-manifest.mjs → NEVER_TOUCH_PATHS` | n/a (constant) | adds same 2 paths | n/a | n/a |
| Copy | `src/cli/tui/upgrade.js:60` legacy-manifest warning | n/a (string literal) | revised to reflect post-fix behavior ("the next upgrade after `/upgrade-project` will be silent for marker-matched files") instead of "re-install … to enable three-way merges" | n/a | n/a — qualitative copy review in Phase 10.6.5 `/cli-copy-review` |

### Libraries and versions

No new third-party APIs introduced. All work uses Node core (`node:fs/promises`, `node:crypto`, `node:path`). The only runtime dependency in `package.json` (`@clack/prompts@1.4.0`) is not touched by this work.

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| `node:fs/promises` (Node ≥ 20) | marker file read/write | `readFile`, `writeFile`, `mkdir` | n/a (Node core) |
| `node:crypto` (Node ≥ 20) | sha256 comparison (existing helper reused) | `createHash` | n/a (Node core) |
| `node:path` (Node ≥ 20) | path joining | `join`, `dirname` | n/a (Node core) |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| Candidate 1 (research) | Extend `.baseline-manifest.json` to v3 with per-file `reconciled_against` field | Forces fixing scout landmine #1 (v2/v3 shape mismatch) in same workflow; inflates spec scope beyond "stop re-prompting." Carved out as separate intake per Non-goals. |
| Candidate 3 (research) | Change stage-manifest lifecycle: `/upgrade-project` marks RECONCILED instead of deleting; CLI cleans up | Constitutional amendment is larger (relaxes SHALL NOT + changes cleanup ownership); discoverability of "have I reconciled X?" is worse (requires scanning multiple stages); changes the meaning of memory_session_start.sh's "N pending stages" surface. |
| Option B (research) | CLI writes marker on next upgrade by detecting "stage was resolved since last run" | Requires "remember last staged ts" persistence — itself a new on-disk artifact, just spelled differently. Net complexity is higher than Option A's narrow SKILL.md amendment. |

## Design calls

The write_set (enumerated under Test plan / Rollout) intersects only `.js`, `.mjs`, and `.md` files. None of `site-src/**`, `app/**`, `components/**`, `pages/**`, `src/**/*.{tsx,jsx,vue,svelte}`, `**/*.html`, `**/*.css`, `**/*.scss`, `**/*.njk` (the project's `tdd.ui_globs`). No UI surfaces — design-ui invocation is not required.

CLI copy that *does* surface to users (in `src/cli/tui/upgrade.js` end-of-run summary at line 101-105) is reviewed in Phase 10.6.5 by the seeded `/cli-copy-review` task (TaskList #18). That is a separate review concern from product-UI design.

- *(none)*

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | given `.claude/memory/_pending.md` body has accumulated session candidates (sha differs from shipped template), when `create-baseline upgrade` runs against a baseline whose `_pending.md` template hash is unchanged, then no prompt fires for `_pending.md` AND the local body is byte-identical after the run | intake AC 1 | §Behavior #1 |
| AC-002 | given `.claude/memory/_resume.md` body has been overwritten by `memory_stop.sh` (sha differs from shipped template), when `create-baseline upgrade` runs against a baseline whose `_resume.md` template hash is unchanged, then no prompt fires for `_resume.md` AND the local body is byte-identical after the run | intake AC 2 | §Behavior #1 |
| AC-003 | given `docs/init/seed.md` was reconciled by `/upgrade-project` against template hash X (marker file records this) AND target shipped template hash is X, when `create-baseline upgrade` runs, then `seed.md` is not re-staged, no prompt fires, AND the upgrade reports the file as NOOP | intake AC 3 | §Behavior #2 |
| AC-004 | given `seed.md` was reconciled against template hash X (marker records X), when `create-baseline upgrade` runs against a NEW baseline with template hash Y ≠ X, then `seed.md` IS staged (SEMANTIC tier) for `/upgrade-project` exactly as today | intake AC 4 | §Behavior #3 |
| AC-005 | given a project installed before this fix lands (no `.baseline-reconciliations.json` on disk), when the user runs `create-baseline upgrade` for the first time post-fix, then no user customizations are destroyed AND the upgrade completes (same prompt set as pre-fix); a SECOND run after the user runs `/upgrade-project` produces zero prompts for marker-matched files | intake AC 5 | §Behavior #5 |
| AC-006 | given `audit-baseline` (`bash .claude/skills/audit-baseline/audit.sh`) AND `create-baseline doctor` running before and after this fix on the same target, then both tools exit with the same status code AND `doctor.report.added` does NOT include `.claude/.baseline-reconciliations.json` | intake AC 6 | §Behavior #6 |
| AC-007 | given the shipped manifest at `obj/template/.claude/manifest.json` after `npm run build`, then `files['.claude/memory/_pending.md'].tier === 'NEVER_TOUCH'` AND `files['.claude/memory/_resume.md'].tier === 'NEVER_TOUCH'` AND `src/cli/install.js → NEVER_TOUCH` Object.freeze list contains both paths | intake AC 7 | §Behavior #1 |
| AC-008 | given the `NEVER_TOUCH` constant in `src/cli/install.js` and the `NEVER_TOUCH_PATHS` set in `scripts/build-manifest.mjs`, then their member sets are equal (asserted via dedicated regression test) | (derived from intake constraints; prevents future drift) | §Behavior #7 |
| AC-009 | given `/upgrade-project --dry-run` running over a stage with PENDING files, when the skill produces its dry-run report, then NO write to `.baseline-reconciliations.json` occurs (dry-run preserves "no side effects" contract) | intake Q4 | §Behavior #4 (negative branch: dry-run skips recordReconciliation call) |
| AC-010 | given a malformed `.baseline-reconciliations.json` on disk (invalid JSON, missing schema_version, wrong shape), when `merge.js` calls `readMarker(target)`, then the function returns `null` AND a single stderr warning is logged AND `merge.js` proceeds as if no marker existed (graceful degradation) | (resilience requirement) | implied by §Behavior #2 alt-branch |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | upgrade twice in succession against unchanged baseline, both runs after a fresh install + simulated `/upgrade-project` reconciliation of seed.md | second run produces 0 prompts; marker file unchanged between runs | AC-003 |
| Golden path | upgrade twice with `_pending.md` body grown by simulated `memory_stop` between runs | second run produces 0 prompts for `_pending.md`; body byte-identical | AC-001 |
| Golden path | upgrade twice with `_resume.md` body changed between runs | second run produces 0 prompts for `_resume.md`; body byte-identical | AC-002 |
| Input boundary | empty `.baseline-reconciliations.json` (`{"schema_version":1,"reconciliations":{}}`) | merge proceeds as if marker absent; no error | AC-010 |
| Input boundary | marker with entry pointing to a `rel` that no longer exists in the template | merge silently ignores the stale entry; processes other files normally | (resilience; derived) |
| Input boundary | marker `schema_version` is a future value (e.g., 2) | readMarker returns null with stderr warning; merge proceeds; no destructive action | AC-010 |
| Contract violation | malformed JSON in marker file | readMarker returns null with stderr warning; merge proceeds | AC-010 |
| Contract violation | marker file is a directory not a file (unusual filesystem state) | readMarker returns null with stderr warning; merge proceeds | AC-010 |
| Contract violation | recordReconciliation called with non-hex `template_sha` | writes the value verbatim (no validation); subsequent matchesReconciledHash works by string equality | (acceptance of "trust the caller"; documented limitation) |
| Concurrency / ordering | two `recordReconciliation` calls in same tick for different `rel`s | both entries land in the file; no lost-write race (write-then-rename) | (implementation detail) |
| Failure mode | filesystem read-only for marker write | recordReconciliation throws MarkerWriteError; `/upgrade-project` reports error per-file but does NOT roll back the reconciliation (LOCAL bytes already on disk) | AC-009 negative |
| Failure mode | template hash X recorded, then user manually edits seed.md AFTER reconciliation but BEFORE next upgrade | marker matches `newHash` against template hash, not against `tgtHash` — file flows through normal customized branch since `tgtHash !== newHash` AND `newHash === reconciled_against` → marker says "you reviewed against this template," so file is NOOP (user's manual edit is preserved) | edge case explicit |
| Regression trap | `NEVER_TOUCH` list in install.js equals `NEVER_TOUCH_PATHS` set in build-manifest.mjs | sets equal (sorted comparison) | AC-008 |
| Regression trap | doctor report on post-marker target does not list `.baseline-reconciliations.json` in `added` | absent from `added` array | AC-006 |
| Regression trap | audit-baseline PASS before vs after fix on dev repo + simulated consumer install | exit 0 both times | AC-006 |
| Regression trap | shipped manifest after `npm run build` declares `_pending.md` + `_resume.md` as `tier: NEVER_TOUCH` | tier values equal `NEVER_TOUCH` | AC-007 |

End-to-end fixture (resolves intake Q5): a programmatic helper in `tests/upgrade-reconciliation-marker.test.mjs` that:
1. Creates a fresh tmp tree via `mkdtemp`.
2. Runs `install.js → install()` to seed a baseline.
3. Modifies `docs/init/seed.md` in the tmp tree to simulate user customization.
4. Calls `threeWayMerge` with a synthesized new template — expects SEMANTIC_MERGE_STAGED.
5. Hand-writes `.baseline-reconciliations.json` with the new template hash (simulating `/upgrade-project`'s `recordReconciliation` call).
6. Calls `threeWayMerge` again with the same template — expects NOOP.
7. Calls `threeWayMerge` with a different template hash — expects SEMANTIC_MERGE_STAGED again.

This avoids invoking Claude inside a test while still exercising the full loop.

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Log | `marker: read` | stderr line: `reconciliation-marker: read N entries from .baseline-reconciliations.json` (when N > 0; silent when 0 or absent) | debug: confirm marker is being consulted |
| Log | `marker: write` | stderr line: `reconciliation-marker: recorded <rel> against template_sha=<first8hex>... at <ts>` | debug: confirm `/upgrade-project` wrote |
| Log | `marker: malformed` | stderr warning: `reconciliation-marker: malformed .baseline-reconciliations.json (<reason>); proceeding without marker` | surface filesystem corruption |
| Metric | — | n/a (CLI tool, no metrics infra) | — |
| Alarm | — | n/a | — |

The CLI doesn't ship a metrics pipeline. Stderr logs are the only observability layer; they're surfaced to the user's terminal directly.

## Rollout

- **Feature flag**: none. The fix is additive (new file, new code path), backwards-compatible by construction (absent marker = pre-fix behavior). No flag needed — bug fix ships unconditionally.
- **Migration order**:
  1. Land the code changes (install.js NEVER_TOUCH expansion, build-manifest.mjs NEVER_TOUCH_PATHS expansion, new reconciliation-marker.js module, merge.js consult, doctor.js exclusion, /upgrade-project SKILL.md amendment).
  2. `npm run build` regenerates `obj/template/.claude/manifest.json` with new tier values for `_pending.md` and `_resume.md`.
  3. Test suite must pass green.
  4. Commit + push triggers semantic-release → npm publish.
  5. Consumers running `npx @friedbotstudio/create-baseline upgrade` next time will get the fix automatically.
- **Canary**: not applicable — npm publish is atomic. The CHANGELOG entry (Phase 11.5) is the user-facing notice.

## Rollback

- **Kill-switch**: users can `rm .claude/.baseline-reconciliations.json` to nuke all recorded reconciliations. `merge.js` falls back to pre-fix behavior for marker-relevant files. No customizations destroyed; user just re-runs `/upgrade-project` if needed.
- **Package-level revert**: standard semantic-release flow — bad version is unpublished or superseded by a patch release. No infrastructure rollback needed.
- **Signal to roll back**: if the published version reports a regression (e.g., user customizations destroyed despite marker present, or marker writes corrupting LOCAL bytes), revert via patch release within the same day. Detection mechanism: GitHub issues + the user's own usage (this project dogfoods every release).

## Archive plan

When this spec ships, the `archive` skill (Phase 10.5) moves the following into `docs/archive/<ship-date>/upgrade-no-replay-prompts/`:

- Defaults *(automatic)*: intake, scout, research, spec, spec-rendered/, spec approval, swarm plan + approval (if used), security reports (concatenated).
- Extras *(list any non-default files)*:
  - *(none)*

## Open questions

All resolved before approval.

- (Q1 from intake — resolved): landmine #1 (v2/v3 manifest shape) is out of scope per Non-goals. Carved to a separate intake.
- (Q2 from intake — resolved): `/upgrade-project` writes the marker (Option A) per research recommendation. SKILL.md:114 constitutional amendment narrowly relaxes the SHALL NOT to permit writes to `.claude/.baseline-reconciliations.json` specifically.
- (Q3 from intake — resolved): NEVER_TOUCH expansion lands in this spec alongside the marker fix; both ship together per user's bundled-ship request.
- (Q4 from intake — resolved): CLI copy in `src/cli/tui/upgrade.js:60` (legacy-manifest warning) is updated **in this workflow**. The current copy promises "re-install with the latest baseline to enable three-way merges next time"; the post-fix behavior is "the next upgrade after running `/upgrade-project` will be silent for marker-matched files." The seeded `/cli-copy-review` phase (TaskList #18) is the natural validation point. No new AC needed — qualitative copy review is the existing remit of that phase. Add this surface to its punch list.
- (Q5 from intake — resolved): end-to-end fixture is programmatic (option b from research), defined in the Test plan section. No new `tests/fixtures/post-reconciliation/` directory needed.
- (NEW-1 — resolved): `.claude/.baseline-reconciliations.json` is **committed to git** by default in consumer projects (rationale: behaves like `package-lock.json` — per-target state worth sharing across team members so the reconciliation history is a build-input not a per-clone secret). No change to the baseline's own `.gitignore`; no change to any shipped `.gitignore` template. Each consumer project decides per-project whether to commit or ignore.
- (NEW-2 — resolved): `recordReconciliation` does **not** validate `template_sha` format for v1. Trust the caller (`/upgrade-project` reads the value unmodified from `manifest.files[rel].sha256`, which is already validated by the manifest loader). Add validation if a second caller is ever introduced. AC-010 covers the read-side resilience (malformed marker → graceful null); write-side validation is intentionally out of scope.
