# Spec — Scoped mutation-testing oracle (advisory, dev-only)

<!-- Technical spec. Approval is the /approve-spec token — never write Status: Approved. -->

## Context

| Input | Path |
|---|---|
| Intake | `docs/intake/mutation-testing-oracle.md` |
| Scout | `docs/scout/mutation-testing-oracle.md` |
| Research | `docs/research/mutation-testing-oracle.md` |
| Brief | `docs/brief/mutation-testing-oracle.md` |
| Codesign state | `.claude/state/codesign/mutation-testing-oracle.json` |

## Goal

A scoped, dev-only mutation-testing oracle (`npm run test:mutation -- <module>`) drives Stryker over one target module against the baseline's `node --test` suite, prints surviving mutants as `file:line:mutation-kind`, and writes an advisory JSON report — never touching `last_test_result` and never shipping to consumers.

## Non-goals

- Whole-repo mutation per run (perTest is unavailable with Stryker's command runner — scope is mandatory).
- Blocking commits/CI on a mutation score (advisory only).
- The configurable tier dial (`-1a2d`) — defaults hardcoded; read from one obvious place so the dial can override later.
- Replacing `node --test` or adding coverage tooling.
- Shipping the oracle to consumer projects (explicitly dev-only this cut).

## Decisions

### Decision: D1 — Mutation tool / dependency strategy

**Options considered:** Stryker @stryker-mutator/core (dev-dep) / Home-grown AST mutator (zero-dep)
**Chosen:** Stryker @stryker-mutator/core as a dev-dependency, with a tested non-shipping invariant (consumer-exposure guard).
**Engineer rationale (verbatim):**
> I accept 1 but how will you ensure it is not shipped to consumers?

**Resolution (baked into AC-007):** three enforced layers — (1) Stryker is a `devDependency`, never installed by `npx create-baseline` consumers; (2) the wrapper lives in `scripts/`, absent from the npm `files` whitelist `["bin/","src/","obj/template/","README.md"]`; (3) it is not a `.claude/` skill, so nothing in the shipped template references it. AC-007 asserts `obj/template/` and the packed tarball contain no `stryker` / wrapper reference.

**Dismissed alternatives:**
- Home-grown AST mutator — Reimplements a mature tool (against seed.md reuse rule); needs a parser dep anyway; inferior operators/reporting. Kept as the fallback only if the Stryker tree were judged unacceptable.

### Decision: D2 — Scope unit

**Chosen:** Named target module — the oracle takes a module path arg, mutates that one file, and runs only its co-named test. Bounds per-mutant cost. Changed-files can layer on later.

### Decision: D3 — Integration seam

**Chosen:** Standalone `npm run test:mutation` → a pure `scripts/` `.mjs` wrapper that shells Stryker, parses its JSON, prints survivors, and writes `.claude/state/mutation/<scope>.json`. Never writes `last_test_result`; does not bump skill/hook/command governance counts.

### Decision: D4 — AC-002 dogfood target

**Chosen:** `.claude/skills/memory-flush/route.mjs` — pure routing logic, no I/O, co-named test; fast per-mutant runs.

## Design

Diagrams are the contract.

### Write set

- `package.json` — add `@stryker-mutator/core` to `devDependencies`; add `"test:mutation"` script.
- `scripts/mutation-oracle.mjs` — NEW. The wrapper (arg parse → Stryker config → invoke → parse report → advisory output). Dev-tree, not shipped.
- `stryker.config.mjs` (or inline config built by the wrapper) — NEW. Command runner + `mutate` scoping. Dev-tree.
- `tests/mutation-oracle.test.mjs` — NEW. Unit tests for the wrapper's pure parts (arg→config mapping, report parsing, advisory-shape) + AC-007 ship-guard assertion.
- `tests/fixtures/mutation-oracle/` — NEW. A deliberately-vacuous test fixture for AC-002.

No write-set file matches `project.json → tdd.ui_globs` — no UI surface.

### C4 — System context

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — mutation oracle
Person(claude, "Claude in /tdd + verify", "wants a test-quality signal")
Person(maint, "Maintainer", "dogfoods on the baseline suite")
System(oracle, "Mutation oracle", "scoped, advisory, dev-only")
System_Ext(stryker, "Stryker (@stryker-mutator/core)", "mutation engine, command runner")
System_Ext(noderunner, "node --test", "the baseline test runner")
Rel(claude, oracle, "runs scoped to a module")
Rel(maint, oracle, "npm run test:mutation -- <module>")
Rel(oracle, stryker, "configures + invokes")
Rel(stryker, noderunner, "runs the module's test per mutant")
@enduml
```

### C4 — Container

```plantuml
@startuml
!include <C4/C4_Container>
title Container — mutation oracle
System_Boundary(o, "Mutation oracle (dev-tree)") {
  Container(wrapper, "scripts/mutation-oracle.mjs", "Node ESM", "arg parse, invoke, parse, report")
  Container(cfg, "stryker config", "mjs", "commandRunner + mutate scope")
  ContainerDb(report, ".claude/state/mutation/<scope>.json", "JSON", "advisory survivors")
}
System_Ext(stryker, "@stryker-mutator/core", "devDependency")
System_Ext(noderunner, "node --test", "runner")
Rel(wrapper, cfg, "builds")
Rel(wrapper, stryker, "spawns")
Rel(stryker, noderunner, "commandRunner.command")
Rel(wrapper, report, "writes advisory")
@enduml
```

### C4 — Component (changed container: the wrapper)

```plantuml
@startuml
!include <C4/C4_Component>
title Component — scripts/mutation-oracle.mjs
Container_Boundary(w, "mutation-oracle.mjs") {
  Component(args, "arg parser", "fn", "module path -> scope")
  Component(conf, "config builder", "fn", "mutate=<file>, command=node --test <test>")
  Component(invoke, "stryker invoker", "fn", "spawn, capture exit + json")
  Component(parse, "report parser", "fn", "json -> survivors[]")
  Component(emit, "advisory emitter", "fn", "stdout + state json; NEVER last_test_result")
}
Rel(args, conf, "scope")
Rel(conf, invoke, "config")
Rel(invoke, parse, "raw report")
Rel(parse, emit, "survivors")
@enduml
```

### Data model — class diagram

```plantuml
@startuml
title Data model — mutation report
class MutationRun {
  +scopeModule: string
  +testCommand: string
  +mutantsTotal: int
  +survivors: int
}
class Survivor {
  +file: string
  +line: int
  +mutationKind: string
}
class AdvisoryReport {
  +generatedAt: string
  +writesLastTestResult: bool = false
}
MutationRun "1" *-- "many" Survivor
MutationRun "1" --> "1" AdvisoryReport : emits
@enduml
```

#### Migration DDL

```sql
-- No database in scope. "Migration" = npm install of the new devDependency + the new dev-tree files.
```

### Behavior — sequence per AC

#### §Behavior #1 — scoped run reports survivors

```plantuml
@startuml
title Behavior #1 — AC-001
actor Caller
participant "mutation-oracle.mjs" as W
participant Stryker
participant "node --test" as N
Caller -> W : test:mutation -- skills/memory-flush/route.mjs
W -> Stryker : mutate=route.mjs, command="node --test tests/memory-flush-route.test.mjs", coverageAnalysis=off
Stryker -> N : run module test per mutant
N --> Stryker : killed / survived
Stryker --> W : json report
W --> Caller : survivors as file:line:kind + exit 0
@enduml
```

#### §Behavior #2 — vacuous test surfaces a survivor

```plantuml
@startuml
title Behavior #2 — AC-002
participant Test as "vacuous fixture test"
participant Stryker
participant W as "oracle"
Stryker -> Test : run against a mutant of the fixture module
alt vacuous test does not assert the mutated behavior
  Test --> Stryker : still passes (mutant SURVIVES)
  Stryker --> W : >=1 survivor
  W --> W : report flags the weak test
end
@enduml
```

#### §Behavior #3 — scope is bounded (no whole-repo)

```plantuml
@startuml
title Behavior #3 — AC-003
participant W as "oracle"
participant Stryker
W -> Stryker : mutate = ONLY the target file
W -> Stryker : command runs ONLY the module's co-named test
Stryker --> W : mutants limited to target; suite not run whole
@enduml
```

#### §Behavior #4 — advisory only, never flips the gate

```plantuml
@startuml
title Behavior #4 — AC-005
participant W as "oracle"
participant Report as ".claude/state/mutation/<scope>.json"
participant Gate as "last_test_result / verify_pass_guard"
W -> Report : write survivors (advisory)
W -> Gate : NO write
note right of Gate : oracle never touches the binding verdict
@enduml
```

#### §Behavior #5 — non-shipping invariant

```plantuml
@startuml
title Behavior #5 — AC-007
participant T as "ship-guard test"
participant Pkg as "package.json files[]"
participant Tar as "obj/template/ + tarball"
T -> Pkg : assert scripts/ not in files[]
T -> Tar : grep -ri stryker / mutation-oracle
alt found in shipped payload
  Tar --> T : FAIL
else absent
  Tar --> T : PASS (dev-only confirmed)
end
@enduml
```

### State — N/A

No runtime state machine; the advisory report is a flat artifact.

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — mutation oracle
left to right direction
[scripts/mutation-oracle.mjs] --> [stryker config]
[scripts/mutation-oracle.mjs] --> [@stryker-mutator/core]
[@stryker-mutator/core] --> [node --test]
[npm script test:mutation] --> [scripts/mutation-oracle.mjs]
[tests/mutation-oracle.test.mjs] --> [scripts/mutation-oracle.mjs]
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| CLI | `npm run test:mutation -- <module>` | a module path | survivors to stdout + `.claude/state/mutation/<scope>.json` | exit≠0 on stryker/internal error (not on survivors) | yes |
| Test | `mutation-oracle.test.mjs` | wrapper pure fns + fixtures | pass | FAIL on regression | yes |
| Test | ship-guard (AC-007) | repo build output | pass | FAIL if stryker/wrapper in shipped payload | yes |

### Libraries and versions

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| `@stryker-mutator/core` (latest major; pins at install) | mutation engine | `commandRunner.command`, `mutate`, `coverageAnalysis:"off"` (perTest unsupported by command runner), `--incremental` | yes (`/stryker-mutator/stryker-js`) |

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| Home-grown AST mutator | zero-dep custom mutator | reimplements a mature tool; needs a parser dep anyway (D1) |
| Custom Stryker node:test runner | unlocks perTest | large maintenance surface; upgrade path, not first cut |

## Design calls

No write-set file intersects `project.json → tdd.ui_globs`.

- *(none)*

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | given a target module with a real test, when `test:mutation -- <module>` runs, then it reports survivors as `file:line:mutation-kind` and exits 0. | intake AC-001 | §Behavior #1 |
| AC-002 | given a deliberately-vacuous test fixture, when the oracle runs on it, then ≥1 surviving mutant is reported. | intake AC-002 | §Behavior #2 |
| AC-003 | given the scope arg, when the oracle runs, then only the target file is mutated and only its co-named test is run (not the whole suite). | intake AC-003 | §Behavior #3 |
| AC-004 | given the bare `node --test` runner, when the oracle runs, then it drives that runner via Stryker's command runner with no Jest/Mocha/Vitest dependency added. | intake AC-004 | §Behavior #1 |
| AC-005 | given the oracle produces findings, when it finishes, then `.claude/state/last_test_result` is unchanged and no verify/commit gate flips. | intake AC-005 | §Behavior #4 |
| AC-006 | given the full suite + `audit-baseline`, when the change lands, then both stay green/PASS and the new helper is `.mjs` (no new Python). | intake AC-006 | §Behavior #1 |
| AC-007 | given the npm `files` whitelist + build output, when packed, then `obj/template/` and the tarball contain no `stryker` reference and no `scripts/mutation-oracle.mjs` (dev-only confirmed). | D1 verbatim | §Behavior #5 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | oracle on memory-flush/route.mjs (real test) | survivors listed, exit 0 | AC-001, AC-004 |
| Golden path | vacuous fixture | ≥1 survivor | AC-002 |
| Input boundary | scope arg points at one file | only that file mutated; only its test run | AC-003 |
| Contract violation | oracle run | last_test_result byte-identical before/after | AC-005 |
| Failure mode | stryker missing/errors | non-zero exit + clear message, no partial report | AC-001 |
| Regression trap | ship-guard: files[] excludes scripts/; tarball/obj free of stryker+wrapper | unchanged | AC-007 |
| Regression trap | full suite + audit-baseline | green/PASS | AC-006 |

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Report | `.claude/state/mutation/<scope>.json` | `{scopeModule, mutantsTotal, survivors[], generatedAt}` | advisory test-quality |
| Stdout | survivor list | `file:line:kind` lines | human/loop read |

## Rollout

- **Feature flag**: none — additive dev tool, off unless invoked.
- **Migration order**: 1 add devDependency + `npm install` → 2 add `scripts/mutation-oracle.mjs` + config → 3 add `test:mutation` script → 4 add tests + vacuous fixture → 5 dogfood on route.mjs.
- **Canary**: run `npm run test:mutation -- .claude/skills/memory-flush/route.mjs` locally; confirm survivors print and `last_test_result` is untouched.

## Rollback

- **Kill-switch**: `git revert` the commit + `npm install` (drops the devDependency). No runtime surface to disable.
- **Signal to roll back**: ship-guard test FAIL (stryker leaked to shipped payload) or any suite/audit regression.

## Archive plan

- Defaults *(automatic)*: intake, brief, scout, research, spec, spec approval, security report.
- Extras *(list any non-default files)*:
  - *(none)*

## Open questions

- *(none — D1–D4 resolved at codesign; changed-files scoping and a custom perTest runner are explicit deferred upgrades, not open questions for this cut.)*
