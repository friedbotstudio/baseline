# Bootstrap the `npx create-baseline` CLI as a root-as-package npm scaffolder

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The Claude Code baseline (17 hooks, 1 subagent, 36 skills, three baseline MCP servers, the genesis `seed.md`, and the in-session constitution `CLAUDE.md`) is published from this repository, but there is no install path for a user starting a fresh project. `seed.md` §16 already names the planned entry point — `npx create-baseline <target>` — and `docs/create-baseline.md` carries a detailed v0.2 design, but the package itself does not exist on disk. There is no `package.json`, no `bin/cli.js`, no `src/*.js` install logic, no `scripts/build-template.sh`, no generated `template/`. The README and seed.md tell users to run `npx create-baseline`, and that command resolves to nothing.

Concrete user scenario: a developer reads the project README, runs `npx create-baseline ./my-app`, and gets a "package not found" error from npm. The marketing claim, the seed.md §16 deliverable list, and the audit-baseline drift detector are all telling consistent lies until this CLI ships.

A previous v0.1 attempt lived in a sibling subdirectory `create-baseline/` and was deleted; its design knowledge has been distilled into `docs/create-baseline.md`. The v0.2 plan inverts the layout — **the repo root *is* the npm package** — so there is exactly one delivery channel and no risk of the canonical baseline drifting from the shipped overlay.

## Goal

Ship a zero-dependency, root-as-package npm CLI that materializes the baseline (`.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`) into a target directory, with safe install / force / merge semantics and a manifest-driven upgrade path, so `npx create-baseline <target>` is a working install command for the baseline this repo produces.

## Non-goals

- Auto-running `/init-project` after install — the CLI lays down files; the user runs `/init-project` themselves to detect their stack and populate `project.json`.
- Additive merge for `.claude/settings.json` `permissions.allow` / `permissions.deny` arrays — file-level merge only for v0.2; document the limitation (per `docs/create-baseline.md` §211).
- Publishing under a scoped name (e.g., `@konark/create-baseline`) — the package name is the unscoped `create-baseline`.
- Porting the deleted `create-baseline/` v0.1 sibling subdirectory verbatim — design knowledge has been distilled into `docs/create-baseline.md`; the rebuild is at root.
- A separate `--upgrade` flag — `--merge` is the upgrade path.
- A TUI, fancy progress spinners, or any `chalk` / `inquirer` / `commander` dependency — zero-dep stdlib only.
- `npm publish` itself — this intake covers building and packing the CLI; a separate decision opens the publish gate.

## Success metrics

- `npm pack` tarball contains exactly `bin/`, `src/`, `template/`, `README.md` and nothing else — verified by inspecting the tarball after `npm pack` (no `.claude/`, no `docs/intake/`, no `scripts/`, no `site/`).
- `audit-baseline` passes against the live root **and** against a directory produced by `npx create-baseline <empty-target>` — measured via `bash .claude/skills/audit-baseline/audit.sh` in both contexts.
- Cold scaffold of an empty target directory completes in under 5 seconds on an M-series Mac after the tarball is fetched, with zero network calls past the initial `npx` fetch — measured via `time npx --yes ./create-baseline-*.tgz ./scratch`.
- Tarball size ≤ 250 KB — measured via `wc -c create-baseline-*.tgz`. Baseline overlay is text + small scripts; this is comfortably above the expected size and gives headroom while flagging accidental binary inclusion.

## Stakeholders

- **Requester**: Repo owner (sole maintainer of this baseline project).
- **Reviewer**: Repo owner — single-author OSS; review happens via this workflow's `/spec-diagram-review`, `/spec-traceability-review`, and `/security` phases rather than a second human.
- **Operator** (who runs it in prod): End users running `npx create-baseline <target>` to scaffold the baseline into their own project. They never see this repo's internals — only the contents of `template/` and the CLI itself.

## Constraints

- **Node ≥ 18.17.0** — needed for `node:util` `parseArgs`, `node:readline/promises`, and `fs.cp({recursive, force, filter})`. Pinned in `package.json` `engines.node`.
- **Zero runtime dependencies** — `package.json` `dependencies` is empty or absent. Only Node stdlib. This is a stated selling point of an `npx`-first tool.
- **`template/` must be gitignored and regenerated** — never committed. v0.1 committed `template/` despite gitignoring it; v0.2 enforces via `prepack` regeneration.
- **`files:` allowlist in `package.json` is authoritative** — `["bin/", "src/", "template/", "README.md"]`. This is the only mechanism preventing `.claude/state/`, `docs/intake/`, `.config/`, and `.playwright-mcp/` from shipping. Anything not in the allowlist is excluded from the npm tarball regardless of `.npmignore`.
- **Constitution invariants** (per `CLAUDE.md` Article VIII) — 17 hooks, 1 subagent (`swarm-worker`), 36 skills. The shipped `template/` and its `manifest.json` must reflect these exactly, or `audit-baseline` fails on a fresh install. The build script + manifest generation guarantee parity by reading the live root state.
- **Sentinel paths for conflict detection** — `.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md` (per `docs/create-baseline.md` §26). Any one present in the target → existing-baseline path; refuse without `--force` or `--merge`.
- **NEVER_TOUCH list** — `.claude/project.json` is owned by `/init-project`; the CLI never overwrites it, even on `--force`. Add if absent; preserve if present.
- **SPECIAL_MERGE for `.mcp.json`** — additive deep-merge of `mcpServers`. New keys added, existing keys preserved verbatim, never delete. User-added MCP servers (e.g., linear, github) survive baseline upgrades.
- **`src/` overlay contract** — pristine `src/*.template.*` files are the canonical ship-time source for `CLAUDE.md`, `seed.md`, `project.json`, `settings.json`, `.mcp.json`, the swarm-worker subagent, and the canonical memory files. The build script overlays them onto the rsync output so dogfood-specific dev state never reaches the tarball. `audit-baseline` enforces this contract.
- **Dogfood-deviation isolation** — the live root carries dogfood-only deviations from canonical defaults (per `seed.md` §16: `swarm.isolation: shared`, `workflow.artifacts.document: null`, dogfood README voice). `src/project.template.json`, `src/CLAUDE.template.md`, and `src/seed.template.md` carry the canonical, ship-voice values. The build overlay must use `src/` for these files; the rsync alone is not safe.
- **`git init` is deferred** per existing project memory — the CLI must build, pack, and self-test in a non-git working tree.

## Acceptance criteria

1. Given an empty target directory, when the user runs `npx create-baseline <target>`, the CLI exits 0 and writes the full baseline tree (`.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`) plus `.claude/.baseline-manifest.json` listing every shipped file with its sha256 hash.
2. Given a target containing any one of the four sentinel paths (`.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`), when the user runs `npx create-baseline <target>` without `--force` or `--merge`, the CLI exits 1 and writes nothing.
3. Given the same conflict scenario as AC2, when the user runs `npx create-baseline <target> --force` and types the literal word `overwrite` at the prompt (case-insensitive), the CLI overwrites every file regardless of customization and exits 0.
4. Given AC3 in a non-TTY context (e.g., piped stdin), when the prompt cannot read a confirmation, the CLI exits 2 without writing.
5. Given a target with an existing `.claude/.baseline-manifest.json` from a prior install, when the user runs `npx create-baseline <target> --merge` and types `merge` at the prompt, then per file: files whose target hash equals the old manifest hash are overwritten with the new content; files whose target hash differs are skipped and reported; files new in the new manifest are added; files removed from the new manifest but present in the old are skipped and reported. Exit code 3 if any file was skipped due to customization, else 0.
6. Given any mode (fresh, force, merge), when `.mcp.json` is written, the CLI performs additive `mcpServers` deep-merge: keys in the baseline manifest but not in the target are added; keys present in the target are preserved verbatim; no key is ever deleted.
7. Given any mode, when the target has no `.claude/project.json`, the CLI writes the canonical `project.json` from `template/`. When the target already has one, the CLI leaves it untouched and emits no warning.
8. Given a successful run in any mode, when the CLI exits 0 (or 3), the target's `.claude/.baseline-manifest.json` contains the new manifest with `manifest_version: 1`, `generated_at` ISO8601 timestamp, and a `files` map of every shipped path → sha256.
9. Given a clean checkout of this repo, when the developer runs `npm pack`, the resulting tarball contains exactly `bin/`, `src/`, `template/`, `README.md` and the implicit `package.json`, with `.claude/`, `docs/` (except as listed in template), `scripts/`, `site/`, `.config/`, `.playwright-mcp/`, and `node_modules/` all absent.
10. Given the package as published, when `npm ls --prod` is run inside an installed copy, the dependency tree contains zero runtime dependencies (`package.json` `dependencies` empty or absent).
11. Given the live root, when `bash scripts/build-template.sh` runs, it (a) rsyncs root → `template/` excluding `.claude/state/`, `.claude/.baseline-manifest.json`, `.claude/settings.local.json`, `src/`, `docs/{intake,brd,specs,rca,scout,research,security,archive}/`, `node_modules/`, `.playwright-mcp/`, `.config/`, `site/`, and `template/` itself; (b) overlays each `src/*.template.*` onto its canonical destination per `docs/create-baseline.md` §93; (c) generates `template/manifest.json` with sha256 per file from the post-overlay state.
12. Given the post-build `template/`, when `bash .claude/skills/audit-baseline/audit.sh` is run with paths re-rooted at `template/`, all baseline invariants pass: 17 hooks present, 1 subagent (swarm-worker) present, 36 skills present, `project.template.json` carries `configured: false`, `seed.template.md` carries the §16 reservation with no `Generated:` stamp, `settings.template.json` wires every baseline hook, the swarm-worker template carries all four substitution tokens.
13. Given the build script as the source of `template/`, when `template/` is removed and the package is repacked via `npm pack` (which fires `prepack`), the tarball is identical (modulo timestamps) to a tarball built from a fresh `template/` — i.e., `prepack` regenerates correctly and `template/` is never required in git.
14. Given a fresh install via `npx create-baseline ./scratch`, when `bash .claude/skills/audit-baseline/audit.sh` is run inside `./scratch`, all baseline invariants pass — the installed tree is operationally equivalent to a freshly cloned baseline source minus the dev-only artifacts.

## Open questions

- **npm-tarball README vs. project README**: the root `README.md` is the project's "what is this baseline" doc. The npm package consumer wants a "how to install via npx" doc. Options: (a) keep one README and accept that it serves both audiences; (b) create `PUBLISH-README.md` and reference it from `package.json` `"readme"` (need to verify npm honors a non-default README path; last design-doc note suggests it does not); (c) split the existing root README into a project-facing top section and an install-facing tail and accept some redundancy. Decision needed before `/spec`.
- **`.claude/.baseline-manifest.json` recommendation in user projects**: gitignore (regenerated, no review value) or commit (PR-reviewable upgrades)? Affects what we tell users in the post-install message and in the README. Decision needed before `/document`.
- **Swarm-worker template shipping**: `template/.claude/agents/swarm-worker.md` rendered with default tokens (works immediately, `/init-project` may re-render later) vs. `template/.claude/templates/agents/swarm-worker.md.template` shipping the raw template (`/init-project` is required to render before the agent works). Per `docs/create-baseline.md` §219 and §111, this is unresolved. Recommendation: ship rendered with default tokens so a fresh install is operational without `/init-project`. Confirm in `/spec`.
- **`--dry-run` flag scope**: include in v0.2 (per `docs/create-baseline.md` §213 bug list) or defer to a follow-up intake? Adds value for `--merge` preview; minimal added complexity. Recommendation: include.
- **Version-pinning hint in install output** (per `docs/create-baseline.md` §214 bug list): print the installed manifest version so users can pin in their docs. Include in v0.2 or defer? Recommendation: include — trivial, one extra `console.log` line.
- **Test framework choice**: `node:test` stdlib (preserves zero-dep selling point; less ergonomic) vs. `vitest` as a `devDependency` (better DX; runtime dep stays zero). The constraint is on **runtime** dependencies, so `vitest` would not violate the "zero-dep" claim — but it adds a build-time dep that ships in `package.json`. Recommendation: `node:test` to keep `package.json` minimal. Decide in `/research`.
- **CI gating posture**: gate publishing on `audit-baseline` alone, or also on a `npm pack && tar -tzf | sort | diff -` check that the tarball contents match an expected file list? The latter is cheap insurance against an accidentally-broad `files:` allowlist. Decide in `/spec` or defer to a follow-up.
- **Publication ownership**: who actually runs `npm publish`, on what cadence, and is 2FA enforced on the npm account? Out of scope for this intake but blocks an actual ship; surface in `/document` or a follow-up intake.
