# Spec — npm-publish-prep (pre-publish verification + runbook)

<!--
Technical spec. Produced by the `spec` skill.
Guard-enforced invariants: required ## headings + required diagram kinds.
Approval: NEVER add "Status: Approved" — spec_approval_guard blocks it.
-->

## Context

| Input | Path |
|---|---|
| Intake | `docs/intake/npm-publish-prep.md` |
| BRD *(if any)* | *(none)* |
| Scout *(if any)* | `docs/scout/npm-publish-prep.md` |
| Research *(if any)* | `docs/research/npm-publish-prep.md` |

## Goal

A maintainer runs `npm run publish:check` against the current tree, reads its green output naming each verification that passed, follows `docs/runbooks/npm-publish.md`, and ships the first `create-baseline` to npm with documented rollback recourse.

## Non-goals

- CI integration. No GitHub Actions, no PR-gated publish — non-git project today.
- Automated version-bump tooling (standard-version, changesets, release-please).
- Multi-package / workspaces support.
- `npm publish --provenance` (deferred pending CI/OIDC).
- Replacing the existing `tests/` suite — new smoke is additive.

## Design

Diagrams are the contract. Prose is only for things a diagram cannot say.

### C4 — System context

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — publish:check + runbook
Person(maintainer, "Maintainer", "Runs publish:check; executes runbook; types npm publish")
System(checker, "publish:check", "Bash + node verification suite that exercises the real shipped tarball before publish")
System_Ext(npm_cli, "npm CLI (>=7)", "npm pack, npm publish, npm pack --dry-run --json, npm unpublish, npm deprecate")
System_Ext(npm_registry, "npm registry", "Receives publish; stores tarball; serves to consumers")
Rel(maintainer, checker, "npm run publish:check")
Rel(checker, npm_cli, "execSync 'npm pack', 'npm pack --dry-run --json', 'npm publish --dry-run'")
Rel(maintainer, npm_cli, "npm publish (after publish:check green)")
Rel(npm_cli, npm_registry, "uploads tarball")
@enduml
```

### C4 — Container

```plantuml
@startuml
!include <C4/C4_Container>
title Container — publish:check infrastructure
System_Boundary(b, "publish:check") {
  Container(orchestrator, "scripts/publish-check.sh", "Bash", "Sequences precheck \\u2192 files-diff \\u2192 smoke; emits PASS/FAIL summary")
  Container(filesdiff, "scripts/check-files-diff.mjs", "Node ESM", "Parses npm pack --dry-run --json; asserts symmetric diff against package.json files:")
  Container(smoke, "scripts/smoke-tarball.mjs", "Node ESM", "Real npm pack to tmpdir; install .tgz into second tmpdir; npx create-baseline ./target; assert sentinels")
  Container(testwrap, "tests/publish-check.test.mjs", "node:test", "Wraps the three scripts in test cases for npm test integration")
  Container(runbook, "docs/runbooks/npm-publish.md", "Markdown", "Human operator guide: version-bump, tag, publish, rollback")
}
Rel(orchestrator, filesdiff, "invokes (step 2)")
Rel(orchestrator, smoke, "invokes (step 3)")
Rel(testwrap, orchestrator, "spawnSync (one test wraps end-to-end)")
Rel(testwrap, filesdiff, "spawnSync (one test wraps unit)")
Rel(testwrap, smoke, "spawnSync (one test wraps unit; deliberately-broken-tarball negative case)")
@enduml
```

### C4 — Component (changed containers only)

```plantuml
@startuml
!include <C4/C4_Component>
title Component — scripts/publish-check.sh + scripts/smoke-tarball.mjs internals
Container_Boundary(orch, "publish-check.sh") {
  Component(o_precheck, "step 1: npm publish --dry-run", "bash", "Fast pre-step; fails fast on prepack/policy errors")
  Component(o_files, "step 2: invoke check-files-diff.mjs", "bash", "Exit code propagated; stderr captured")
  Component(o_smoke, "step 3: invoke smoke-tarball.mjs", "bash", "Heaviest step; runs last so cheap failures surface first")
  Component(o_summary, "step 4: PASS/FAIL summary", "bash trap", "Single-line summary naming the failing sub-check on error")
}
Container_Boundary(sm, "smoke-tarball.mjs") {
  Component(s_pack, "pack stage", "Node", "mkdtemp; npm pack --pack-destination <tmp>; capture tarball path")
  Component(s_install, "install stage", "Node", "mkdtemp; npm install <tarball-abs-path> --no-save --prefer-offline")
  Component(s_exec, "exec stage", "Node", "mkdtemp target; execFileSync(node, ['<install>/node_modules/create-baseline/bin/cli.js', '<target>'])")
  Component(s_assert, "assert stage", "Node", "Read target/.claude/.baseline-manifest.json; assert presence of CLAUDE.md, .mcp.json, .claude/, target/.claude/.baseline-manifest.json matches obj/template/manifest.json hashes")
}
Rel(o_precheck, o_files, "on PASS")
Rel(o_files, o_smoke, "on PASS")
Rel(o_smoke, o_summary, "on PASS or FAIL")
Rel(s_pack, s_install, "tarball path")
Rel(s_install, s_exec, "installed cli path")
Rel(s_exec, s_assert, "target dir")
@enduml
```

### Data model — class diagram

File-structure model (no DDL — file-system state).

```plantuml
@startuml
title Data model — publish:check artifacts and IO
class PublishCheckSh <<bash>> {
  +path: "scripts/publish-check.sh"
  +inputs: "(none)"
  +outputs: stdout summary + exit code
  +exit_code: 0 on PASS, non-zero on any sub-FAIL
}
class CheckFilesDiffMjs <<node>> {
  +path: "scripts/check-files-diff.mjs"
  +inputs: "package.json files:[], npm pack --dry-run --json"
  +outputs: "stdout report (declared, packed, missing, extra)"
  +exit_code: 0 on symmetric match, 1 on diff
}
class SmokeTarballMjs <<node>> {
  +path: "scripts/smoke-tarball.mjs"
  +inputs: "(repo at HEAD)"
  +outputs: "stdout phase log; exits with named missing-file error on fail"
  +exit_code: 0 on green install+exec+assert
}
class PublishCheckTestMjs <<test>> {
  +path: "tests/publish-check.test.mjs"
  +inputs: "(driven by node:test)"
  +outputs: "test verdicts piped to last_test_result"
  +cases: "files_diff_green, smoke_green, smoke_red_negative_path"
}
class NpmPublishRunbook <<doc>> {
  +path: "docs/runbooks/npm-publish.md"
  +sections: "version-bump | precheck | tag | publish | verify-install | rollback"
}
class PackageJsonAdditions <<config>> {
  +scripts: <<changed>> "publish:check, publish:precheck, publish:files-diff, publish:smoke"
}

PublishCheckSh "1" --> "1" CheckFilesDiffMjs : invokes
PublishCheckSh "1" --> "1" SmokeTarballMjs : invokes
PublishCheckTestMjs "1" --> "1" PublishCheckSh : spawnSync (integration)
PublishCheckTestMjs "1" --> "1" CheckFilesDiffMjs : spawnSync (unit + negative)
PublishCheckTestMjs "1" --> "1" SmokeTarballMjs : spawnSync (unit + negative)
PackageJsonAdditions "1" --> "1" PublishCheckSh : "scripts.publish:check"
@enduml
```

#### Migration DDL

```sql
-- forward
-- File-system only; no schema migration.
-- New files: scripts/publish-check.sh, scripts/check-files-diff.mjs,
--   scripts/smoke-tarball.mjs, tests/publish-check.test.mjs,
--   docs/runbooks/npm-publish.md.
-- Modified: package.json (add 4 scripts: publish:check, publish:precheck,
--   publish:files-diff, publish:smoke).

-- reverse
-- Delete the 5 new files; remove the 4 added scripts from package.json.
-- No state migration required.
```

### Behavior — sequence per AC

#### §Behavior #1 — publish:check exits 0 on the current tree (AC-001)

```plantuml
@startuml
title Behavior #1 — npm run publish:check green path
actor Maintainer
participant "publish-check.sh" as Orch
participant "npm CLI" as Npm
participant "check-files-diff.mjs" as Files
participant "smoke-tarball.mjs" as Smoke

Maintainer -> Orch : npm run publish:check
Orch -> Npm : npm publish --dry-run
Npm --> Orch : exit 0 (prepack + policy clean)
Orch -> Files : exec
Files -> Npm : npm pack --dry-run --json
Npm --> Files : JSON {files[], entryCount, ...}
Files --> Orch : exit 0 (symmetric)
Orch -> Smoke : exec
Smoke -> Npm : npm pack --pack-destination $TMP
Npm --> Smoke : create-baseline-0.1.0.tgz
Smoke -> Npm : npm install ./tgz --no-save (in second tmpdir)
Npm --> Smoke : installed
Smoke -> Smoke : execFileSync(node, [installed-cli, $target])
Smoke -> Smoke : assert .claude/, CLAUDE.md, manifest match
Smoke --> Orch : exit 0
Orch --> Maintainer : "PASS: precheck, files-diff, smoke (3 of 3)"
@enduml
```

#### §Behavior #2 — Every `files:` declared prefix is present + non-empty in the packed tarball (AC-002)

```plantuml
@startuml
title Behavior #2 — files-diff asserts declared prefixes present
participant "check-files-diff.mjs" as Files
participant "npm CLI" as Npm
participant "package.json" as Pkg

Files -> Pkg : read files:[]
Pkg --> Files : ["bin/", "src/", "obj/template/", "README.md"]
Files -> Npm : npm pack --dry-run --json
Npm --> Files : files: [{path: "README.md"}, {path: "bin/cli.js"}, {path: "src/cli/io.js"}, ...]
Files -> Files : for each declared prefix: assert >=1 packed file matches
alt all prefixes have packed entries
  Files --> Files : exit 0
else any declared prefix has zero packed entries
  Files --> Files : exit 1 with "declared prefix <X> has no packed files"
end
@enduml
```

#### §Behavior #3 — Smoke catches a deliberately-broken tarball (AC-003)

```plantuml
@startuml
title Behavior #3 — Negative-path: missing manifest.json
participant "publish-check.test.mjs" as Test
participant "smoke-tarball.mjs" as Smoke
participant "tar" as Tar

Test -> Test : real npm pack → create-baseline-0.1.0.tgz
Test -> Tar : extract; rm obj/template/manifest.json; tar -czf broken.tgz
Test -> Smoke : run with BROKEN_TARBALL=./broken.tgz env override
Smoke -> Smoke : install broken.tgz into tmpdir
Smoke -> Smoke : execFileSync(node, [cli, target])
Smoke -> Smoke : assert manifest present → throws "missing baseline-required file: obj/template/manifest.json"
Smoke --> Test : exit 1 with named error
Test -> Test : assert exit != 0 AND stderr matches /obj\/template\/manifest\.json/
@enduml
```

#### §Behavior #4 — Runbook is operator-actionable cold (AC-004)

```plantuml
@startuml
title Behavior #4 — Runbook self-review pass
actor Reviewer
participant "docs/runbooks/npm-publish.md" as Runbook

Reviewer -> Runbook : open cold (no prior create-baseline familiarity)
Runbook --> Reviewer : section 1 "Prerequisites" (npm login, repo cwd)
Reviewer -> Reviewer : verify each step has a literal command or filename
Runbook --> Reviewer : section 2 "Version bump (manual edit)" — names file + exact line
Runbook --> Reviewer : section 3 "Precheck — npm run publish:check"
Runbook --> Reviewer : section 4 "Publish — npm publish --access public --tag latest"
Runbook --> Reviewer : section 5 "Verify install — npx create-baseline@<ver> /tmp/x"
Runbook --> Reviewer : section 6 "Rollback — 72h unpublish + deprecate template"
Reviewer -> Reviewer : execute npm publish --dry-run end-to-end following runbook
Reviewer --> Reviewer : pass (no questions raised)
@enduml
```

#### §Behavior #5 — Rollback section captures unpublish policy + deprecate template + version-bump strategy (AC-005)

```plantuml
@startuml
title Behavior #5 — Rollback consultation
actor Operator
participant "docs/runbooks/npm-publish.md §Rollback" as Section

Operator -> Section : "published 0.1.0 is broken — what now?"
Section --> Operator : Step 1: "Confirm within 72h of publish: npm unpublish create-baseline@<ver>"
Section --> Operator : Step 2: "If >72h: npm deprecate create-baseline@<ver> '<msg>'"
Section --> Operator : Step 3: "Bump patch in package.json (0.1.0 → 0.1.1)"
Section --> Operator : Step 4: "Fix the bug; rerun npm run publish:check"
Section --> Operator : Step 5: "npm publish --access public --tag latest"
Section --> Operator : Step 6: "Verify: npx create-baseline@latest resolves to 0.1.1"
@enduml
```

#### §Behavior #6 — Smoke installs into a fresh tmpdir and exercises create-baseline end-to-end (AC-006)

```plantuml
@startuml
title Behavior #6 — Smoke end-to-end materialization
participant "smoke-tarball.mjs" as Smoke
participant "fs/promises" as Fs
participant "npm CLI" as Npm
participant "execFileSync" as Exec

Smoke -> Fs : mkdtemp(os.tmpdir() + "/smoke-pack-")
Fs --> Smoke : packDir
Smoke -> Npm : npm pack --pack-destination $packDir <REPO>
Npm --> Smoke : create-baseline-0.1.0.tgz
Smoke -> Fs : mkdtemp(os.tmpdir() + "/smoke-install-")
Fs --> Smoke : installDir
Smoke -> Npm : npm install <packDir>/create-baseline-0.1.0.tgz --no-save --prefer-offline (cwd: installDir)
Npm --> Smoke : installed
Smoke -> Fs : mkdtemp(os.tmpdir() + "/smoke-target-")
Fs --> Smoke : targetDir
Smoke -> Exec : execFileSync('node', [installDir+'/node_modules/create-baseline/bin/cli.js', targetDir])
Exec --> Smoke : exit 0 + stdout
Smoke -> Fs : readFile(targetDir+'/.claude/.baseline-manifest.json')
Fs --> Smoke : installed manifest
Smoke -> Smoke : assert installed-manifest.files == obj/template/manifest.json.files (hash-for-hash)
Smoke -> Smoke : assert hook count, skill count match seed §4 (22 hooks, 36 skills)
Smoke --> Smoke : exit 0
@enduml
```

#### §Behavior #7 — files-diff reports declared-not-packed AND packed-not-declared (AC-007)

```plantuml
@startuml
title Behavior #7 — symmetric files diff
participant "check-files-diff.mjs" as Files
== declared-but-not-packed ==
Files -> Files : for each prefix in package.json.files:
Files -> Files : count packed files matching prefix
alt zero matches
  Files --> Files : record "DECLARED-NOT-PACKED: <prefix>"
end
== packed-but-not-declared ==
Files -> Files : for each packed file
Files -> Files : test against every declared prefix
alt no prefix matches
  Files --> Files : record "PACKED-NOT-DECLARED: <path>"
end
== summary ==
alt any violations
  Files --> Files : print violations; exit 1
else
  Files --> Files : print "files-diff: clean (N declared prefixes, M packed entries)"; exit 0
end
@enduml
```

#### §Behavior #8 — Wrapping orchestrator surfaces failing sub-check by name (AC-008)

```plantuml
@startuml
title Behavior #8 — orchestrator failure summary
participant "publish-check.sh" as Orch
participant "Sub-check N" as Sub

Orch -> Orch : set -euo pipefail; trap 'on_exit $?' EXIT
Orch -> Sub : run precheck OR files-diff OR smoke
alt sub-check exits non-zero
  Sub --> Orch : exit N
  Orch -> Orch : capture stderr; print "FAIL: <sub-check name>"
  Orch -> Orch : trap fires; emit one-line summary
  Orch --> Orch : exit N (propagated)
else all green
  Orch --> Orch : print "PASS: precheck, files-diff, smoke (3 of 3)"
  Orch --> Orch : exit 0
end
@enduml
```

### State — finite-state model

```plantuml
@startuml
title State — publish:check invocation lifecycle
[*] --> PrecheckRunning : start
PrecheckRunning --> FilesDiffRunning : exit 0
PrecheckRunning --> Failed : exit != 0
FilesDiffRunning --> SmokeRunning : exit 0
FilesDiffRunning --> Failed : exit != 0
SmokeRunning --> Passed : exit 0
SmokeRunning --> Failed : exit != 0
Passed --> [*] : emit "PASS:..."; exit 0
Failed --> [*] : emit "FAIL: <name>"; exit N
@enduml
```

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — publish:check + adjacent infra
left to right direction
[publish-check.sh] --> [npm CLI]
[publish-check.sh] --> [check-files-diff.mjs]
[publish-check.sh] --> [smoke-tarball.mjs]
[check-files-diff.mjs] --> [npm CLI]
[check-files-diff.mjs] --> [package.json]
[smoke-tarball.mjs] --> [npm CLI]
[smoke-tarball.mjs] --> [node child_process]
[smoke-tarball.mjs] --> [node fs/promises]
[smoke-tarball.mjs] --> [node os]
[smoke-tarball.mjs] --> [bin/cli.js]
[smoke-tarball.mjs] --> [obj/template/manifest.json]
[publish-check.test.mjs] --> [publish-check.sh]
[publish-check.test.mjs] --> [check-files-diff.mjs]
[publish-check.test.mjs] --> [smoke-tarball.mjs]
[publish-check.test.mjs] --> [node test]
[package.json scripts] --> [publish-check.sh]
[docs/runbooks/npm-publish.md] --> [publish-check.sh]
[docs/runbooks/npm-publish.md] --> [npm CLI]
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| CLI | `npm run publish:check` | none (reads repo CWD) | stdout per-check summary; exit 0 PASS / non-zero FAIL | failing sub-check exits non-zero with `FAIL: <name>` line | yes |
| Script | `scripts/publish-check.sh` | none | as above | propagates sub-check exit code | yes |
| Script | `scripts/check-files-diff.mjs` | reads `package.json` + runs `npm pack --dry-run --json` | stdout report; exit 0 on symmetric, 1 on diff | reports declared-not-packed and packed-not-declared | yes |
| Script | `scripts/smoke-tarball.mjs` | none (operates against repo at CWD) | stdout phase log; exit 0 on green | named missing-file errors on broken-tarball case | yes (uses mktemp per run) |
| Test | `tests/publish-check.test.mjs` | driven by `node --test` | test verdicts | spawnSync subprocess errors propagate | yes |
| Doc | `docs/runbooks/npm-publish.md` | (read-only) | step-by-step actions for human operator | n/a | n/a |
| pkg | `package.json → scripts.publish:check` | none | `bash scripts/publish-check.sh` | n/a | yes |

### Libraries and versions

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| `npm@11.11.0` | CLI tool (preinstalled) | `npm pack`, `npm pack --dry-run --json`, `npm pack --pack-destination <dir>`, `npm publish --dry-run`, `npm install <tarball>`, `npm unpublish`, `npm deprecate` | no (local `npm help` is authoritative for the installed CLI; verified empirically in this repo) |
| `node@>=18.17.0` | Runtime (engines.node) | `fs/promises.mkdtemp`, `os.tmpdir`, `child_process.execFileSync`, `child_process.execSync`, `node:test`, `node:assert/strict` | no (Node stdlib; established pattern in `tests/cli.test.mjs`, `tests/install.test.mjs`) |

Zero new runtime or dev dependencies introduced.

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| A | `npm pack --dry-run` alone (no real pack) as the smoke test | `--dry-run` skips `prepack`, so it doesn't audit the real published artifact — defeats the whole purpose |
| B | `verdaccio` private-registry mock for publish simulation | Adds heavy devDependency + new operational surface (config, port); no incremental coverage over real-`npm pack` |
| C | `npm-packlist` programmatic library for files-diff | Reinvents what `npm pack --dry-run --json` already exposes from the same internal library; YAGNI |
| D | Bash-only `publish:check` orchestrator (no node helpers) | Bash JSON parsing requires `jq` (new dep) or fragile sed/awk; node already in the toolchain |
| E | Pure-node orchestrator (no bash) | Loses bash's idiomatic per-step `set -e` + `trap` summary; AC-008's "one-line FAIL: <name>" is harder to format cleanly |

## Design calls

*(none — no UI write_set intersection with `project.json → tdd.ui_globs`)*

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | given current repo at HEAD, when `npm run publish:check` runs, then exit 0 and a one-line summary names every passed check | intake AC 1 | §Behavior #1 |
| AC-002 | given current repo at HEAD, when `npm pack` runs and tarball is inspected, then every prefix in `package.json → files:` has at least one non-empty packed file | intake AC 2 | §Behavior #2 |
| AC-003 | given a tarball with `obj/template/manifest.json` deliberately removed, when smoke runs against it, then exit non-zero with error naming the missing file (not a generic ENOENT) | intake AC 3 | §Behavior #3 |
| AC-004 | given `docs/runbooks/npm-publish.md`, when a cold reviewer (no prior create-baseline familiarity) reads it, then they can execute a dry-run publish without asking questions | intake AC 4 | §Behavior #4 |
| AC-005 | given a broken published version, when operator consults rollback section, then they find the 72h `npm unpublish` policy, `npm deprecate` template, version-bump strategy, and ordered steps | intake AC 5 | §Behavior #5 |
| AC-006 | given the smoke test, when it runs from a fresh `mktemp -d`, then it installs the tarball, invokes create-baseline against an empty target dir, and asserts the materialized baseline matches the manifest hash-for-hash and the canonical counts | intake AC 6 | §Behavior #6 |
| AC-007 | given `package.json → files:`, when files-diff runs, then it reports declared-not-packed AND packed-not-declared violations (symmetric) | intake AC 7 | §Behavior #7 |
| AC-008 | given any sub-check fails, when the wrapping `publish:check` exits, then exit code is non-zero and a one-line `FAIL: <name>` summary appears in stdout/stderr | intake AC 8 | §Behavior #8 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | `publish:check` runs on current tree | exit 0; stdout names 3 PASS checks | AC-001 |
| Golden path | `check-files-diff.mjs` on current tree | exit 0; "files-diff: clean (N, M)" | AC-002, AC-007 |
| Golden path | `smoke-tarball.mjs` on current tree | exit 0; phases log; assertions pass | AC-006 |
| Input boundary | `check-files-diff.mjs` when a `files:` prefix has zero packed matches (synthetic empty-dir) | exit 1; "DECLARED-NOT-PACKED: <prefix>" | AC-002 |
| Input boundary | `check-files-diff.mjs` when packed file is not under any declared prefix (synthetic) | exit 1; "PACKED-NOT-DECLARED: <path>" | AC-007 |
| Contract violation | `smoke-tarball.mjs` against a tarball missing `obj/template/manifest.json` (negative-path fixture) | exit non-zero; stderr matches /obj\/template\/manifest\.json/ | AC-003 |
| Concurrency / ordering | not applicable | — | — |
| Failure mode | `publish-check.sh` when sub-check #2 fails | exit non-zero; "FAIL: files-diff" surfaces; sub-check #3 NOT invoked | AC-008 |
| Failure mode | `publish-check.sh` when sub-check #3 fails | exit non-zero; "FAIL: smoke" surfaces | AC-008 |
| Regression trap | `tests/npm-pack-tarball.test.mjs` continues to pass unchanged | `site/` exclusion still asserted | existing |
| Regression trap | All 132 existing node tests continue to pass | full suite green | existing |
| Operator simulation | one-time `runbook walkthrough` self-review | reviewer executes `npm publish --dry-run` per runbook end-to-end | AC-004 |
| Operator simulation | rollback consultation simulation | reviewer locates 5-step rollback in <30 seconds | AC-005 |

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Log | stdout from `publish-check.sh` | append-only text; per-step "PASS: <name>" or "FAIL: <name>" lines + final summary | operator reads it during publish |
| Log | stderr from sub-scripts | captured + surfaced by orchestrator on failure | operator triage |
| Alarm | *(none — operator-driven, no SLO)* | — | — |

## Rollout

- **Feature flag**: none. New tooling additive; doesn't alter existing test commands or publish behavior.
- **Migration order**: (1) write failing tests in `tests/publish-check.test.mjs` (RED); (2) implement `scripts/check-files-diff.mjs`; (3) implement `scripts/smoke-tarball.mjs`; (4) implement `scripts/publish-check.sh`; (5) wire `package.json` scripts; (6) write `docs/runbooks/npm-publish.md`; (7) `npm test` GREEN; (8) `npm run publish:check` exits 0; (9) audit-baseline PASS.
- **Canary**: not applicable. Maintainer's first invocation of `npm run publish:check` is the canary.

## Rollback

- **Kill-switch**: revert the 5 new files + the 4 added scripts in `package.json`. No state to roll back.
- **Signal to roll back**: `npm run publish:check` consistently false-positives (passes on a known-broken tree) OR false-negatives (fails on a known-good tree). Operator notices during first real use; reverting is a 1-commit file-revert on non-git this means manual restoration from the archive bundle.

## Archive plan

- Defaults *(automatic)*: intake, scout, research, spec, spec approval, security report (if any). The runbook at `docs/runbooks/npm-publish.md` is the *product* of this workflow and STAYS in place after archive (it's not an in-flight artifact).
- Extras *(list any non-default files)*:
  - *(none — the runbook is product, the scripts are product; neither gets archived)*

## Open questions

- *(none — design is settled by the research recommendations; no unresolved choices remain)*
