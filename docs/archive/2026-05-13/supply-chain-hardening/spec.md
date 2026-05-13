# Spec — supply-chain hardening (Tier 1 + 2 + 3)

<!--
Technical spec. Produced by the `spec` skill.
Guard-enforced invariants: required ## headings + required diagram kinds.
Approval: NEVER add "Status: Approved" — spec_approval_guard blocks it.
-->

## Context

| Input | Path |
|---|---|
| Intake | *(excepted — Snyk article + gap analysis is intake-equivalent; see Context below)* |
| BRD *(if any)* | *(none)* |
| Scout *(if any)* | *(excepted — touchpoints listed inline)* |
| Research *(if any)* | *(excepted — three primary sources reviewed; findings inline)* |

**Primary sources reviewed**:
- Snyk, *TanStack npm Packages Compromised* (CVE-2026-45321, GHSA-g7cv-rxg3-hmpx) — `https://snyk.io/blog/tanstack-npm-packages-compromised/`
- NVD + GHSA, *tj-actions/changed-files* (CVE-2025-30066) — `https://nvd.nist.gov/vuln/detail/CVE-2025-30066`, `https://github.com/advisories/GHSA-mrrh-fwg8-r2c3`
- Adnan Khan, *The monsters in your build cache: GitHub Actions cache poisoning* (2024-05-06, updated 2025-01) — `https://adnanthekhan.com/2024/05/06/the-monsters-in-your-build-cache-github-actions-cache-poisoning/`

**Cross-cutting patterns extracted from the three attacks**:

| Pattern | Used by |
|---|---|
| `/proc/<pid>/mem` runner-memory dump to extract tokens | TanStack, tj-actions, Adnan's PoC |
| Mutable git tags retroactively pointed at malicious commits | tj-actions root cause |
| GitHub Actions cache poisoning with 6-hour token validity | TanStack delivery, Adnan's research |
| `gist.githubusercontent.com` as exfil / second-stage host | TanStack second stage, tj-actions first stage |
| Injected `optionalDependencies` with `prepare` script | TanStack payload delivery into target tarball |
| Valid SLSA L3 provenance on malicious build | TanStack ("first documented npm worm with valid attestation"), Adnan's "Most Devious Backdoor" PoC |
| Three-layer obfuscation + daemonization + persistent hooks | TanStack |
| Specific targeting of `.claude/` project files for persistence | TanStack |

**Touchpoints in our codebase** (scout-equivalent):
- `scripts/check-files-diff.mjs` — extend with package.json integrity + executable allowlist
- `scripts/smoke-tarball.mjs` — extend with installed-tree hash verification
- `tests/publish-check.test.mjs` — extend with negative-path coverage for each new check
- `docs/runbooks/npm-publish.md` — substantial additions
- `src/.npmrc.template` — **new** pristine ship-time file
- `scripts/build-template.sh` — overlay the new template into `obj/template/`
- `bin/cli.js` + `src/cli/doctor.js` — strengthen `doctor` for verify use case (design call below)
- `package.json` — pin devDependencies to exact versions

## Goal

When a maintainer runs `npm run publish:check`, the script catches every TanStack-style attack vector that's mechanically detectable at pack time (injected deps, prepare scripts, surprise executables, hash drift). When a downstream user runs `npx create-baseline verify <target>`, the CLI exits non-zero if any byte of the materialized baseline has been tampered with after install. When an operator follows the updated runbook, they explicitly check for the dead-man's-switch indicators Snyk documented before any credential operation.

## Non-goals

- **Sigstore / cosign signing of our published tarball.** Operator keypair management is out of scope; deferred until we have CI.
- **CI pipeline.** This workflow does not add GitHub Actions; the runbook documents future-CI invariants but does not implement them.
- **Provenance generation.** `npm publish --provenance` requires OIDC; deferred until CI exists. The runbook documents the limitations of provenance (both Snyk and Adnan agree it attests build, not authorization).
- **Two-person publish rule.** Operational policy, not technical control; deferred.
- **Rebuilding from scratch on every install.** Out of scope; the verify command compares against the shipped manifest, it does not re-build.
- **Real-time exfiltration detection.** Egress monitoring (Harden-Runner / Step Security) is footnoted in the runbook but not implemented.

## Design

Diagrams are the contract. Prose is only for things a diagram cannot say.

### Design call — `verify` subcommand vs. strengthen `doctor`

**Selected**: strengthen the existing `doctor` subcommand. Rationale:
- `doctor` already reads `.baseline-manifest.json` and reports matched / customized / missing / added paths against the install snapshot.
- The new behavior — flag a `customized` path as `FAIL` rather than informational when the user has not declared an opt-out, AND surface the named files prominently — is a contract change, not a new surface.
- Keeps the CLI surface at four modes (default install, `--force`, `--merge`, `doctor`) instead of five.
- Operators expecting "did the baseline tamper" will already reach for `doctor`; making it stricter matches that mental model.

`doctor` gains a new flag `--strict` (default `false` for backwards compatibility; `true` is what `npm run baseline:verify` invokes via a target-project npm script the user wires up).

### C4 — System context

```plantuml
@startuml
!include <C4/C4_Context>
title System Context — supply-chain hardening
Person(maintainer, "Maintainer", "Publishes create-baseline; follows runbook hygiene")
Person(downstream, "Downstream user", "Runs npx create-baseline; later runs create-baseline doctor")
System(checker, "publish:check", "Hardened pre-publish verification")
System(cli, "create-baseline CLI", "doctor subcommand with --strict hash verification")
System_Ext(npm_cli, "npm CLI", "npm pack, install, publish")
System_Ext(npm_registry, "npm registry", "Stores published tarball")
Rel(maintainer, checker, "npm run publish:check (before publish)")
Rel(maintainer, npm_cli, "npm publish (after publish:check green)")
Rel(npm_cli, npm_registry, "uploads tarball")
Rel(downstream, npm_registry, "npm install / npx create-baseline")
Rel(downstream, cli, "create-baseline doctor --strict <target>")
@enduml
```

### C4 — Container

```plantuml
@startuml
!include <C4/C4_Container>
title Container — hardened publish + post-install verify
System_Boundary(pub, "publish:check (hardened)") {
  Container(orch, "scripts/publish-check.sh", "Bash", "Unchanged shape; chains 3 steps")
  Container(files, "scripts/check-files-diff.mjs", "Node ESM", "Extended: package.json integrity + executable allowlist + symmetric files diff")
  Container(smoke, "scripts/smoke-tarball.mjs", "Node ESM", "Extended: post-install installed-tree hash verification against shipped manifest")
}
System_Boundary(cli_b, "create-baseline CLI") {
  Container(cli_main, "bin/cli.js", "Node ESM", "Routes doctor subcommand; --strict flag added")
  Container(doctor, "src/cli/doctor.js", "Node ESM", "Extended: --strict mode promotes customized to FAIL and lists each tampered file")
}
Container(npmrc_tmpl, "src/.npmrc.template", "static", "New: ignore-scripts=true + min-release-age=7 defaults for target")
Container(runbook, "docs/runbooks/npm-publish.md", "Markdown", "Extended with hygiene sweep + future-CI invariants")
Rel(orch, files, "step 2")
Rel(orch, smoke, "step 3")
Rel(cli_main, doctor, "subcommand dispatch")
Rel(npmrc_tmpl, cli_main, "overlaid at install via build-template.sh stage 2")
@enduml
```

### C4 — Component (changed containers only)

```plantuml
@startuml
!include <C4/C4_Component>
title Component — check-files-diff + smoke + doctor internals
Container_Boundary(cfd, "check-files-diff.mjs") {
  Component(cfd_pkg, "package.json integrity", "Node", "dependencies==[]; optionalDependencies absent; no postinstall/preinstall/install; bin allowlist {create-baseline → bin/cli.js}; prepare warned if present and != 'bash scripts/build-template.sh'")
  Component(cfd_files, "files diff (existing)", "Node", "Symmetric declared vs packed with implicit-include allowlist (package.json, README, LICENSE)")
  Component(cfd_exec, "executable allowlist", "Node", "For each packed file: if mode 0o111 OR shebang OR ext in {.sh,.py,.mjs,.cjs,.js} at root-level prefix, path must be under bin/, scripts/, .claude/hooks/, .claude/skills/*/ ELSE flagged as SURPRISE-EXECUTABLE")
  Component(cfd_devpin, "devDeps pin check", "Node", "Each entry in package.json.devDependencies must be exact version (no ^, ~, x.y.* ranges)")
}
Container_Boundary(sm, "smoke-tarball.mjs") {
  Component(sm_pack, "pack + install (existing)", "Node", "Unchanged shape")
  Component(sm_required, "required-files check (existing)", "Node", "obj/template/manifest.json, CLAUDE.md, .mcp.json, docs/init/seed.md, bin/cli.js")
  Component(sm_hash, "installed-tree hash verify", "Node", "Walks installed-package/obj/template/**; for each file, compares sha256 against shipped manifest.json.files[<rel>]; fails on first mismatch with the path named")
}
Container_Boundary(doc, "doctor (--strict mode)") {
  Component(doc_walk, "walk install (existing)", "Node", "Categorizes paths as matched / customized / missing / added")
  Component(doc_strict, "strict promotion", "Node", "When --strict: customized contributes to exit 1; output lists each tampered path with shipped vs on-disk sha256")
  Component(doc_report, "report (existing)", "Node", "Format unchanged for default; under --strict, prefixes each customized line with 'TAMPERED:' for grep")
}
Rel(cfd_pkg, cfd_files, "run before")
Rel(cfd_files, cfd_exec, "run after")
Rel(cfd_exec, cfd_devpin, "run after")
Rel(sm_pack, sm_required, "after install")
Rel(sm_required, sm_hash, "after required-files pass")
Rel(doc_walk, doc_strict, "feeds")
Rel(doc_strict, doc_report, "feeds")
@enduml
```

### Data model — class diagram

```plantuml
@startuml
title Data model — verify contract
class ShippedManifest <<file>> {
  +path: obj/template/manifest.json
  +manifest_version: 2
  +generated_at: ISO-8601
  +files: map<string, sha256-hex>
  +owners.skills: map<slug, "baseline">
}
class InstalledManifest <<file>> {
  +path: <target>/.claude/.baseline-manifest.json
  +(byte-equal copy of ShippedManifest at install time)
}
class TargetTree <<dir>> {
  +path: <target>/
  +observed_files: map<rel-path, sha256-hex>
}
class DoctorReport <<output>> {
  +matched: count
  +customized: list<{path, shipped_sha256, observed_sha256}>
  +missing: list<path>
  +added: list<path>
  +exit_code: int <<0 on clean, 1 on missing, 1 on customized when --strict>>
}
class NpmrcTemplate <<file>> {
  +path: src/.npmrc.template (in dev repo)
  +overlay_target: obj/template/.npmrc (in shipped package)
  +install_target: <target>/.npmrc (after CLI runs)
  +contents: "ignore-scripts=true\nmin-release-age=7\n"
}
ShippedManifest "1" --> "1" InstalledManifest : copied verbatim at install
InstalledManifest "1" --> "*" TargetTree : doctor walks
TargetTree "*" --> "1" DoctorReport : observed file set
NpmrcTemplate "1" --> "1" TargetTree : materializes .npmrc on install
@enduml
```

#### Migration DDL

```sql
-- forward
-- File-system only; no schema migration.
-- New files:
--   src/.npmrc.template (overlay source)
-- Modified files:
--   scripts/check-files-diff.mjs (+ 4 sub-checks)
--   scripts/smoke-tarball.mjs (+ installed-tree hash verify)
--   src/cli/doctor.js (+ --strict mode)
--   bin/cli.js (route --strict flag to doctor)
--   tests/publish-check.test.mjs (+ 6 cases)
--   tests/doctor.test.mjs (+ 2 cases for --strict)
--   scripts/build-template.sh (overlay .npmrc template in stage 2)
--   docs/runbooks/npm-publish.md (substantial new sections)
--   package.json (devDependencies pinned to exact versions; @11ty/eleventy@3.1.5, nunjucks@3.2.4)

-- reverse
-- Delete src/.npmrc.template and the overlay line in build-template.sh.
-- Revert the script + test edits.
-- Restore ^-range devDependency entries.
```

### Behavior — sequence per AC

#### §Behavior #1 — Files-diff catches injected optionalDependencies (AC-001)

```plantuml
@startuml
title Behavior #1 — package.json integrity check trips on injected optionalDependencies
participant "tests/publish-check.test.mjs" as Test
participant "check-files-diff.mjs" as Files
participant "(synthetic) package.json" as Pkg

Test -> Test : mkdtemp; write synthetic package.json with optionalDependencies: { "@evil/x": "github:..." }
Test -> Files : spawnSync('node', [...], { cwd: synthDir })
Files -> Pkg : read package.json
Pkg --> Files : { dependencies: [], optionalDependencies: { "@evil/x": ... }, ... }
Files -> Files : assert optionalDependencies absent → FAILS
Files --> Test : exit 1; stderr matches /OPTIONAL_DEPS_FORBIDDEN.*@evil\/x/
Test -> Test : assert exit != 0 AND stderr matches the violation
@enduml
```

#### §Behavior #2 — Files-diff catches injected postinstall script (AC-002)

```plantuml
@startuml
title Behavior #2 — package.json scripts allowlist catches postinstall
participant "tests/publish-check.test.mjs" as Test
participant "check-files-diff.mjs" as Files

Test -> Test : synthetic package.json with scripts.postinstall: "node evil.js"
Test -> Files : spawn
Files -> Files : assert scripts.postinstall absent → FAILS
Files --> Test : exit 1; stderr matches /SCRIPT_HOOK_FORBIDDEN.*postinstall/
@enduml
```

#### §Behavior #3 — Files-diff catches surprise executable (AC-003)

```plantuml
@startuml
title Behavior #3 — executable allowlist trips on surprise file
participant "tests/publish-check.test.mjs" as Test
participant "check-files-diff.mjs" as Files
participant "(repo)" as Repo

Test -> Repo : touch obj/template/.claude/router_runtime.js (simulating TanStack-style injection); chmod +x
note right of Repo : will be reverted in test finally{}
Test -> Files : spawn in repo root
Files -> Files : npm pack --dry-run --json
Files -> Files : for each packed file: check mode + shebang + extension
Files -> Files : finds obj/template/.claude/router_runtime.js NOT under hooks/ or skills/*/
Files --> Test : exit 1; stderr matches /SURPRISE-EXECUTABLE.*router_runtime\.js/
Test -> Repo : finally → remove the injected file
@enduml
```

#### §Behavior #4 — Smoke catches manifest-hash drift between shipped and installed (AC-004)

```plantuml
@startuml
title Behavior #4 — installed-tree hash verify catches single-byte tampering of the published tarball
participant "tests/publish-check.test.mjs" as Test
participant "smoke-tarball.mjs" as Smoke
participant "tar" as Tar

Test -> Test : real npm pack → original.tgz; extract → mutate ONE byte in <pkg>/obj/template/CLAUDE.md; repack → tampered.tgz
Test -> Smoke : spawn with TAMPERED_TARBALL=<path>
Smoke -> Smoke : install tampered.tgz into tmpdir
Smoke -> Smoke : execute create-baseline against target (clean install of tampered content)
Smoke -> Smoke : walk installed-package/obj/template/**; for each file, compute sha256
Smoke -> Smoke : compare against shipped manifest.json hashes
Smoke -> Smoke : CLAUDE.md hash mismatch → fail
Smoke --> Test : exit 1; stderr matches /HASH_MISMATCH.*obj\/template\/CLAUDE\.md/
@enduml
```

#### §Behavior #5 — devDependency exact-version check (AC-005)

```plantuml
@startuml
title Behavior #5 — devDeps pin check trips on ^-range
participant "tests/publish-check.test.mjs" as Test
participant "check-files-diff.mjs" as Files

Test -> Test : synthetic package.json with devDependencies: { "@11ty/eleventy": "^3.1.5" }
Test -> Files : spawn
Files -> Files : detect range character → FAILS
Files --> Test : exit 1; stderr matches /DEVDEP_RANGE_FORBIDDEN.*\^3\.1\.5/
@enduml
```

#### §Behavior #6 — doctor --strict surfaces tampered file as FAIL (AC-006)

```plantuml
@startuml
title Behavior #6 — doctor --strict promotes 'customized' to exit 1 with named files
actor User
participant "bin/cli.js" as CLI
participant "src/cli/doctor.js" as Doctor
participant "<target>" as Target

User -> CLI : create-baseline doctor --strict <target>
CLI -> Doctor : runDoctor({strict: true, target})
Doctor -> Target : read .claude/.baseline-manifest.json
Target --> Doctor : manifest with sha256 entries
Doctor -> Target : walk .claude/** ; compute sha256 per file
Doctor -> Doctor : categorize: 1 customized (CLAUDE.md was edited post-install)
Doctor -> Doctor : strict mode: customized.count > 0 → exit_code = 1
Doctor --> CLI : formatted report with "TAMPERED: CLAUDE.md  shipped=abc... observed=def..."
CLI --> User : stdout report; exit 1
@enduml
```

#### §Behavior #7 — npx create-baseline materializes target/.npmrc (AC-007)

```plantuml
@startuml
title Behavior #7 — install overlays the shipped .npmrc template into target/
actor User
participant "bin/cli.js (freshInstall)" as Install
participant "<installed pkg>" as Pkg
participant "<target>" as Target

User -> Install : npx create-baseline /tmp/target --no-plantuml
Install -> Pkg : read obj/template/.npmrc (overlaid from src/.npmrc.template at prepack)
Pkg --> Install : "ignore-scripts=true\nmin-release-age=7\n"
Install -> Target : write /tmp/target/.npmrc
Install -> Target : write the rest of the baseline (.claude, CLAUDE.md, .mcp.json, ...)
Install --> User : "Installed baseline; target/.npmrc set with hardened defaults"
note right of Target : if target/.npmrc already exists pre-install, freshInstall refuses; --force or --merge needed (existing behavior)
@enduml
```

#### §Behavior #8 — runbook hygiene sweep covers Snyk-documented IOCs (AC-008)

```plantuml
@startuml
title Behavior #8 — operator follows runbook's hygiene sweep before npm publish
actor Operator
participant "docs/runbooks/npm-publish.md §Pre-publish hygiene sweep" as Section

Operator -> Section : "before I run npm publish, what do I check?"
Section --> Operator : Step 1: ls ~/.local/bin/gh-token-monitor.sh ~/.config/systemd/user/gh-token-monitor.service ~/Library/LaunchAgents/com.user.gh-token-monitor.plist
Section --> Operator : Step 2: if any exist → STOP; rotate creds; do not publish
Section --> Operator : Step 3: grep -l 'sk-\\|ghp_\\|AKIA\\|xoxb-' ~/.claude/projects/*.jsonl 2>/dev/null
Section --> Operator : Step 4: if matches → STOP; redact + rotate
Section --> Operator : Step 5: npm whoami; npm profile get tfa → must read 'auth-and-writes'
Section --> Operator : Step 6: only after all 5 clean → proceed to npm run publish:check
Operator -> Operator : execute each check; all clean
Operator -> Operator : proceed
@enduml
```

### State — `doctor --strict` exit-code state machine

```plantuml
@startuml
title State — doctor --strict exit decision
[*] --> ReadManifest : invocation
ReadManifest --> NoManifest : .baseline-manifest.json absent
ReadManifest --> Walk : present
NoManifest --> [*] : exit 2 (matches existing semantics)
Walk --> Classify : observed sha256 per path
Classify --> AllMatched : 0 customized, 0 missing
Classify --> HasMissing : missing > 0
Classify --> HasCustomized : customized > 0, missing == 0
Classify --> Both : missing > 0 AND customized > 0
AllMatched --> [*] : exit 0
HasMissing --> [*] : exit 1 (existing semantics)
HasCustomized --> StrictDecision : --strict flag
StrictDecision --> [*] : strict=true → exit 1
StrictDecision --> [*] : strict=false → exit 0 (existing semantics; informational only)
Both --> [*] : exit 1
@enduml
```

### Dependencies — graph

```plantuml
@startuml
' @kind dependency-graph
title Dependencies — supply-chain hardening surfaces
left to right direction
[publish-check.sh] --> [check-files-diff.mjs]
[publish-check.sh] --> [smoke-tarball.mjs]
[check-files-diff.mjs] --> [package.json integrity sub-check]
[check-files-diff.mjs] --> [executable allowlist sub-check]
[check-files-diff.mjs] --> [devDeps pin sub-check]
[check-files-diff.mjs] --> [npm pack --dry-run --json]
[smoke-tarball.mjs] --> [installed-tree hash verify]
[installed-tree hash verify] --> [obj/template/manifest.json]
[bin/cli.js] --> [src/cli/doctor.js]
[src/cli/doctor.js] --> [doctor --strict mode]
[doctor --strict mode] --> [.claude/.baseline-manifest.json]
[build-template.sh stage 2] --> [src/.npmrc.template]
[bin/cli.js freshInstall] --> [obj/template/.npmrc]
[obj/template/.npmrc] --> [target/.npmrc]
[tests/publish-check.test.mjs] --> [check-files-diff.mjs]
[tests/publish-check.test.mjs] --> [smoke-tarball.mjs]
[tests/doctor.test.mjs] --> [doctor --strict mode]
[docs/runbooks/npm-publish.md §Pre-publish hygiene sweep] --> [Snyk IOC paths]
[docs/runbooks/npm-publish.md §future-CI invariants] --> [SHA-pinning rule]
[docs/runbooks/npm-publish.md §future-CI invariants] --> [no-cache-in-release rule]
@enduml
```

### Contracts

| Kind | Name | Input | Output | Errors | Idempotent |
|---|---|---|---|---|---|
| CLI | `create-baseline doctor [<target>] [--strict]` | optional target dir; optional flag | stdout report categorizing paths | `--strict` exits 1 on any `customized` | yes |
| CLI | `npm run publish:check` (unchanged shape) | repo CWD | summary line | new failure modes via extended sub-checks | yes |
| File | `<target>/.npmrc` | written by `freshInstall` from `obj/template/.npmrc` | `ignore-scripts=true\nmin-release-age=7\n` | refuses overwrite without `--force`/`--merge` | yes |
| File | `obj/template/.npmrc` | overlaid in build-template.sh stage 2 from `src/.npmrc.template` | as above | n/a | yes |
| Script | `scripts/check-files-diff.mjs` (extended) | reads package.json + npm pack JSON | report; exit codes: 0 clean, 1 violation | new violation codes: `OPTIONAL_DEPS_FORBIDDEN`, `SCRIPT_HOOK_FORBIDDEN`, `BIN_PATH_FORBIDDEN`, `SURPRISE-EXECUTABLE`, `DEVDEP_RANGE_FORBIDDEN`, plus existing | yes |
| Script | `scripts/smoke-tarball.mjs` (extended) | repo CWD | phase log; exit codes: 0 clean, 1 violation | new violation: `HASH_MISMATCH: <path>` | yes |
| Doc | `docs/runbooks/npm-publish.md` (extended) | (read-only) | step-by-step actions | n/a | n/a |

### Libraries and versions

| Library@version | Purpose | Key APIs | Confirmed via context7 |
|---|---|---|---|
| `node@>=18.17.0` | Runtime (engines.node) | `fs/promises`, `crypto.createHash('sha256')`, `child_process.execFileSync`, `node:test` | no (stdlib; established pattern) |
| `npm@11.11.0` | CLI tool (preinstalled) | `npm pack --dry-run --json` (files[].mode field used for the executable check) | no (local `npm help`; verified empirically) |
| `@11ty/eleventy@3.1.5` (pinned this workflow) | site build (devDep only; not shipped) | `eleventy.config.cjs` integration unchanged | no |
| `nunjucks@3.2.4` (pinned this workflow) | site templating (devDep only; not shipped) | implicit via Eleventy | no |

Zero new runtime or dev dependencies introduced. The two existing devDeps are pinned exact, not added.

### Alternatives considered

| Alt | Summary | Rejected because |
|---|---|---|
| A | New `create-baseline verify <target>` subcommand instead of strengthening `doctor` | Adds a fifth CLI surface for behavior `doctor` is already designed to do; cognitive overhead for downstream users. Selected path: extend `doctor` with `--strict`. |
| B | Sign published tarball with cosign + verify on install | Requires operator keypair management out of band; cosign isn't a runtime dep. Deferred to a future workflow once CI exists (where ephemeral keys via Sigstore OIDC are cheap). |
| C | Embed a Trusted Signing Identity (a public key) in the CLI; refuse install if registry tarball doesn't match | Same key-management problem; chicken-and-egg with first publish (which key signs version 0.1.0?). Deferred. |
| D | Auto-rotate the shipped manifest's `generated_at` to a deterministic value (no wall clock) so two builds produce byte-identical manifests | Useful for reproducible-build verification, but the smoke test reads the live shipped manifest, not a pinned hash. Out of scope; potential future workflow. |
| E | Ship `npm-shrinkwrap.json` alongside the package | Locks the downstream's npm install, but we have zero runtime deps so it adds nothing today. Worth revisiting if we ever take a runtime dep. |
| F | Use a separate `runtime` and `tools` package split (mono-publish) | Premature; we have one CLI today. |

## Design calls

*(none — no UI write_set intersection with `project.json → tdd.ui_globs`)*

## Acceptance criteria

| ID | Criterion (given / when / then) | Upstream | Sequence |
|---|---|---|---|
| AC-001 | Given a synthetic `package.json` with `optionalDependencies: { "@evil/x": "github:..." }`, when `node check-files-diff.mjs` runs in that cwd, then exit non-zero with stderr matching `/OPTIONAL_DEPS_FORBIDDEN.*@evil\/x/`. | TanStack injected-optionalDeps vector | §Behavior #1 |
| AC-002 | Given a synthetic `package.json` with `scripts.postinstall: "node evil.js"`, when files-diff runs, then exit non-zero with stderr matching `/SCRIPT_HOOK_FORBIDDEN.*postinstall/`. Same check fires on `preinstall`, `install`. Note: `prepare` is allowed only when its value is exactly `bash scripts/build-template.sh`. | TanStack prepare-script vector + npm install-hook RCE class | §Behavior #2 |
| AC-003 | Given a synthetic file at `obj/template/.claude/router_runtime.js` chmod +x (TanStack-style injection), when files-diff runs on the real repo, then exit non-zero with stderr matching `/SURPRISE-EXECUTABLE.*router_runtime\.js/`. Allowlist: `bin/`, `scripts/`, `.claude/hooks/`, `.claude/skills/*/`. The check examines mode bits AND shebang AND extension (`.sh`, `.py`, `.mjs`, `.cjs`, `.js`). | TanStack persistence via `.claude/router_runtime.js` | §Behavior #3 |
| AC-004 | Given a real `npm pack`-produced tarball with ONE byte mutated in `<pkg>/obj/template/CLAUDE.md` then repacked, when `smoke-tarball.mjs` runs with `TAMPERED_TARBALL=<path>` env override, then exit non-zero with stderr matching `/HASH_MISMATCH.*obj\/template\/CLAUDE\.md/`. | Post-publish tampering / cache poisoning of the install path | §Behavior #4 |
| AC-005 | Given a synthetic `package.json` whose `devDependencies` carries a `^`-range value, when files-diff runs, then exit non-zero with stderr matching `/DEVDEP_RANGE_FORBIDDEN/`. The check rejects any of `^`, `~`, `*`, `x`, `>`, `<`, ` ` (space-separated), `||`. Exact pins like `3.1.5` pass. Git URLs and file URLs fail with a separate code `DEVDEP_NON_REGISTRY`. | Dev-dep supply-chain hardening | §Behavior #5 |
| AC-006 | Given an installed baseline at `<target>` where `<target>/CLAUDE.md` has been edited post-install (one byte changed), when `create-baseline doctor --strict <target>` runs, then exit 1 with stdout matching `/TAMPERED: CLAUDE\.md.*shipped=[0-9a-f]{64}.*observed=[0-9a-f]{64}/`. Without `--strict`, the same case exits 0 (existing behavior preserved). | Post-install tampering detection | §Behavior #6 |
| AC-007 | Given a fresh empty target dir, when `node bin/cli.js <target> --no-plantuml` runs against the current published-style installed package (or an `npm install ./<tarball>` of it), then `<target>/.npmrc` exists and contains exactly `ignore-scripts=true\nmin-release-age=7\n` (no extra blank lines, no comments, no BOM). | Defense-in-depth: ship hardened npm defaults to downstreams | §Behavior #7 |
| AC-008 | Given `docs/runbooks/npm-publish.md` after this workflow lands, when an operator reads the "Pre-publish hygiene sweep" section, then the section names — verbatim, character-for-character — these paths: `~/.local/bin/gh-token-monitor.sh`, `~/.config/systemd/user/gh-token-monitor.service`, `~/Library/LaunchAgents/com.user.gh-token-monitor.plist`; AND the section contains a `grep` command pattern that scans `~/.claude/projects/*.jsonl` for credential-like substrings (`sk-`, `ghp_`, `AKIA`, `xoxb-`). | Snyk-documented IOC paths must travel into our docs | §Behavior #8 |
| AC-009 | Given `docs/runbooks/npm-publish.md` after this workflow lands, when an operator reads the "Future-CI invariants" section, then it contains: (a) the rule "third-party Actions MUST be pinned to a 40-character commit SHA, never to tag refs" with the tj-actions CVE-2025-30066 citation; (b) the rule "release workflows MUST set `cache: false` on `setup-*` actions and MUST NOT use `actions/cache`" with the SLSA L3 quote from Adnan's paper; (c) a footnote naming `step-security/harden-runner` as an egress-monitoring evaluation candidate. | Forward-looking CI hygiene from research | n/a (text invariant) |
| AC-010 | Given the test suite after this workflow lands, when `npm test` runs, then all 142 pre-existing tests pass + the new tests added by this workflow pass; audit-baseline reports PASS; `npm run publish:check` exits 0 against the current repo. | Regression discipline | n/a (integration) |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | publish:check on current tree | exit 0; PASS summary | AC-010 |
| Golden path | doctor (no --strict) on fresh-installed target | exit 0; matched count == manifest entries; customized == 0 | AC-006 baseline (no regression) |
| Input boundary | files-diff on synthetic pkg with `optionalDependencies` | exit 1; OPTIONAL_DEPS_FORBIDDEN named | AC-001 |
| Input boundary | files-diff on synthetic pkg with `postinstall` | exit 1; SCRIPT_HOOK_FORBIDDEN.postinstall | AC-002 |
| Input boundary | files-diff on synthetic pkg with `preinstall` | exit 1; SCRIPT_HOOK_FORBIDDEN.preinstall | AC-002 |
| Input boundary | files-diff on synthetic pkg with `install` script | exit 1; SCRIPT_HOOK_FORBIDDEN.install | AC-002 |
| Input boundary | files-diff on synthetic pkg with `prepare` != allowlisted value | exit 1; PREPARE_NOT_ALLOWLISTED | AC-002 boundary |
| Contract violation | files-diff with `obj/template/.claude/router_runtime.js` chmod +x injected then reverted | exit 1; SURPRISE-EXECUTABLE.router_runtime.js | AC-003 |
| Contract violation | files-diff on synthetic pkg with `devDependencies: { "x": "^1.0.0" }` | exit 1; DEVDEP_RANGE_FORBIDDEN | AC-005 |
| Contract violation | files-diff on synthetic pkg with `devDependencies: { "x": "github:foo/bar" }` | exit 1; DEVDEP_NON_REGISTRY | AC-005 |
| Contract violation | smoke against tampered tarball (1 byte mutated in CLAUDE.md, repacked) | exit 1; HASH_MISMATCH:obj/template/CLAUDE.md | AC-004 |
| Behavior | doctor --strict on installed target with one byte mutated in CLAUDE.md | exit 1; "TAMPERED: CLAUDE.md" with shipped+observed sha256 | AC-006 |
| Behavior | doctor --strict on clean installed target | exit 0 | AC-006 |
| Behavior | npx create-baseline → target/.npmrc exists with exact required contents | file exists; bytes match exactly | AC-007 |
| Text invariant | runbook contains the 3 Snyk IOC paths verbatim | regex match per AC-008 | AC-008 |
| Text invariant | runbook contains future-CI invariants section with SHA-pinning + cache rules | regex match per AC-009 | AC-009 |
| Regression trap | All 142 pre-existing tests pass | full suite green | AC-010 |
| Regression trap | audit-baseline overall PASS | fails=0 warns=0 | AC-010 |

## Observability

| Signal | Name | Shape | Purpose |
|---|---|---|---|
| Log | stdout from `publish-check.sh` | unchanged shape; new failure codes propagate | operator triage |
| Log | stdout from `doctor --strict` | new `TAMPERED:` prefix per offending file | post-install audit |
| Log | stderr from `check-files-diff.mjs` | new violation codes documented in script header | publish-time triage |
| Alarm | *(none — operator-driven, no SLO)* | — | — |

## Rollout

- **Feature flag**: none for Tier 1/Tier 2 (additive). For Tier 3, the `--strict` flag is opt-in (default `false`) so existing `doctor` callers keep their semantics.
- **Migration order**: (1) write failing tests RED; (2) extend check-files-diff with the 4 new sub-checks; (3) extend smoke-tarball with the hash verify; (4) extend doctor with --strict; (5) write src/.npmrc.template + add overlay line to build-template.sh; (6) pin devDependencies in package.json; (7) extend the runbook with hygiene-sweep + future-CI sections; (8) `npm test` GREEN; (9) `npm run publish:check` exits 0; (10) audit-baseline PASS.
- **Canary**: not applicable — operator runs `publish:check` before each release; first invocation post-merge is the canary.

## Rollback

- **Kill-switch**: revert the script + spec + runbook edits; delete `src/.npmrc.template` and the corresponding stage-2 cp line. `doctor` retains backwards-compat semantics without `--strict`.
- **Signal to roll back**: `publish:check` consistently false-positives (refuses a known-good tree), OR `doctor --strict` flags drift that does not exist. Operator notices on first run; rollback is file-revert.

## Archive plan

- Defaults *(automatic)*: spec, spec approval, security report (concatenated). Note: intake/scout/research are in `exceptions` for this workflow.
- Extras *(list any non-default files)*:
  - *(none — runbook updates are product; src/.npmrc.template is product; scripts changes are product)*

## Open questions

- *(none — research-driven scope; design call resolved; ACs cover the named threat models)*
