# Codebase Scout Report — create-baseline-cli

Scope: the slice of the repo the `npx create-baseline <target>` CLI will touch when scaffolded as a root-as-package npm package. The CLI surface (`bin/`, `scripts/`, `template/`, `package.json`) is currently **absent at root** — this is true bootstrapping, not modification. Most of the report therefore catalogs **inputs** the CLI must consume (overlay templates, sentinel paths, audit invariants) rather than code paths to modify.

## Primary touchpoints

### Net-new files (will be created)

- `package.json` (root) — npm package manifest. `name: "create-baseline"`, `bin: { "create-baseline": "bin/cli.js" }`, `files: ["bin/", "src/", "template/", "README.md"]`, `engines.node: ">=18.17.0"`, `scripts.prepack: "bash scripts/build-template.sh"`. No runtime dependencies.
- `bin/cli.js` — CLI entry; argv parse via `node:util` `parseArgs`, mode routing (fresh / `--force` / `--merge` / `--dry-run`), confirmation prompts via `node:readline/promises`.
- `src/cli/io.js` — color + log + prompt helpers. (Filename TBD in spec; could be `src/io.js` per design doc §201.)
- `src/cli/conflict.js` — sentinel-path scan: `.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`.
- `src/cli/manifest.js` — `hashFile`, `loadManifest`, `saveManifest`, `buildManifestFromDir` (sha256 of file bytes; `manifest_version: 1`).
- `src/cli/mcp.js` — additive deep-merge of `mcpServers` (new keys add, existing keys win).
- `src/cli/install.js` — fresh / force install via `fs.cp({recursive, force, filter})`.
- `src/cli/merge.js` — three-way merge with `NEVER_TOUCH` (= `[".claude/project.json"]`) and `SPECIAL_MERGE` (= `[".mcp.json"]`) tables.
- `scripts/build-template.sh` — generates `template/` from root: rsync with excludes, overlay `src/*.template.*` onto canonical destinations, then run manifest builder.
- `scripts/build-manifest.mjs` — writes `template/manifest.json` (sha256 per file, post-overlay).
- `template/` — generated, gitignored, regenerated at `prepack`. Contains the shipped `.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`, `manifest.json`.

### Existing files that will be modified

- `.gitignore:1-39` — append `node_modules/`, `template/`, `*.log` (none present today).
- `README.md:147-174` — install instructions currently say `npx create-baseline` but the package doesn't exist; either point at this spec's deliverable or split into project README vs. npm README per intake open question.
- `docs/init/seed.md:600` (§16 Open follow-ups) — strike "Bootstrap `package.json` for the planned `npx create-baseline` CLI" once shipped.
- `.claude/skills/audit-baseline/audit.sh:396-403` — helper-scripts list may extend with `scripts/build-template.sh` so audit verifies presence + executability (mirror existing pattern for `validate.sh`, `swarm_merge.sh`, `render.sh`, `lint.sh`, `archive.sh`).

### Existing files consumed but not modified (canonical inputs)

- `src/CLAUDE.template.md` (170+ lines, ship-voice constitution) — overlaid onto `template/CLAUDE.md`.
- `src/seed.template.md` — overlaid onto `template/docs/init/seed.md`. §16 reservation must remain pristine (no `Generated:` stamp).
- `src/project.template.json` — overlaid onto `template/.claude/project.json`. `configured: false` is invariant.
- `src/.mcp.template.json` — overlaid onto `template/.mcp.json`. Three baseline servers (context7, plantuml, playwright).
- `src/settings.template.json` — overlaid onto `template/.claude/settings.json`. Wires all 17 hooks.
- `src/agents/swarm-worker.template.md` — carries 4 substitution tokens (`{{NAME}}`, `{{DESCRIPTION}}`, `{{SKILLS}}`, `{{ROLE_LINE}}`). Per design doc §111, intake recommendation is to overlay as rendered `template/.claude/agents/swarm-worker.md` with default tokens, not as a `.template` file (resolves intake open question pending spec).
- `src/memory/{conventions,decisions,landmarks,landmines,libraries,pending-questions}.template.md` — six canonical pristine memory files; each must keep zero `##` entries post code-fence stripping (audit invariant).
- `.claude/hooks/*.sh` (17 files) — copied wholesale into `template/.claude/hooks/`.
- `.claude/skills/<36 dirs>/` — copied wholesale into `template/.claude/skills/`.
- `.claude/commands/{approve-spec,approve-swarm,grant-commit,init-project}.md` (4 files) — copied wholesale.
- `.claude/agents/swarm-worker.md` — the live rendered file; **not** what ships (the overlay step writes the template-rendered version on top).
- `docs/create-baseline.md` (226 lines) — primary design-input document; v0.2 plan distilled from a deleted v0.1 attempt. Required reading for `/research` and `/spec`.
- `.mcp.json` (root) — sentinel path, also overlaid (see above) for the shipped version.

## Entry points that reach this code

- **End-user CLI**: `npx create-baseline <target>` after `npm publish`. Resolves to `bin/cli.js` via `package.json` `"bin"` field. Modes selected by argv: bare (fresh), `--force`, `--merge`, `--dry-run`.
- **Build entry**: `npm pack` triggers `prepack` → `bash scripts/build-template.sh` → `node scripts/build-manifest.mjs`.
- **Audit entry on shipped tarball** (post-spec): `npm pack` then `tar -xzf` then `bash .claude/skills/audit-baseline/audit.sh` inside the unpacked tree — verifies the shipped template still satisfies the constitution.
- **Local-development invocation** (pre-publish): `node bin/cli.js <target>` directly, or `npx --yes ./create-baseline-*.tgz <target>` after a local pack.

## Existing tests

- **`bash .claude/skills/audit-baseline/audit.sh`** (773 lines) — the project's only "test" today, per `.claude/project.json` `test.cmd`. Currently PASSing per `.claude/state/last_test_result` (2026-04-28). Verifies:
  - 17 hooks, 1 agent (swarm-worker), 36 skills, 4 commands (counts + names per `seed.md` §4).
  - All 17 baseline hooks wired in `.claude/settings.json`.
  - Helper scripts: `validate.sh`, `swarm_merge.sh`, `render.sh`, `lint.sh`, `archive.sh`, `audit.sh` (present + executable).
  - `src/` overlay contract: `CLAUDE.template.md` (constitution voice or user-voice lede), `project.template.json` (configured:false), `seed.template.md` (§16 reserved, no `Generated:` stamp), `.mcp.template.json` (3 baseline servers), `settings.template.json` (every hook wired), `agents/swarm-worker.template.md` (all 4 tokens), `memory/*.template.md` (pristine).
  - Numeric claims in `CLAUDE.md`, `README.md`, `seed.md` match disk (the 17/36/1/4 counts are cross-referenced).
- **No test framework on disk yet.** `node:test`, `vitest`, `jest` — none installed. Picking one is a `/research` decision (intake open question).
- **No CI workflow on disk yet.** `.github/workflows/audit.yml` is named in `seed.md` §16 follow-up #2 but does not exist. Out of scope for this slug; pairs naturally with it.

## Constraints and co-changes

- **`.claude/project.json`** — owned by `/init-project`, dogfood-configured (`configured: true`, `swarm.isolation: shared`, `workflow.artifacts.document: null`, `tdd.source_globs` extended to `src/**`, `bin/**`, `scripts/**`). On `NEVER_TOUCH` list: the CLI must never overwrite this in user projects, even on `--force`. The dogfood deviations in this file must not leak — `src/project.template.json` carries the canonical pristine version; build overlay writes that, not the live root file.
- **`.claude/settings.json` vs `.claude/settings.local.json`** — both present at root. The build excludes `.claude/settings.local.json` (per-user) and overlays `src/settings.template.json` onto `template/.claude/settings.json`. Local overrides never ship.
- **`.claude/state/`** — runtime workflow state (workflow.json, approvals, swarm plans, harness logs, last_test_result, setup_guard_last_warn). Build excludes wholesale. Already gitignored at `.gitignore:5`.
- **`.claude/memory/_pending.md` and `_resume.md`** — runtime memory. `_resume.md` already gitignored at `.gitignore:13`. `_pending.md` body fragment also ignored. Build excludes both.
- **`docs/init/seed.md` §16 dogfood content** — `Generated:` stamp + recommender output present in live root. `src/seed.template.md` overlay strips this; build must use the overlay, not the live root file.
- **`docs/{intake,brd,specs,rca,scout,research,security,archive}/`** — workflow artifacts (this very document lives in `docs/scout/`). Per design doc §90, build must exclude these. Currently `docs/intake/`, `docs/scout/`, `docs/init/` are populated; the others are lazily created.
- **`docs/create-baseline.md`** — distilled design knowledge. Build excludes (it's a meta-doc about the CLI itself, not part of the shipped baseline).
- **Constitution count claims** — `CLAUDE.md` Article VIII enumerates 17 hooks; `seed.md` §0 and §4 enumerate counts; `README.md` enumerates counts. Audit enforces parity. The CLI doesn't change these counts but its build script must preserve them in `template/` (no accidental drop of any hook/skill/command/agent in the rsync exclude rules).
- **Excludes for non-baseline root content** (per design doc §196): `.config/`, `.playwright-mcp/`, `site/`, `.DS_Store`, `node_modules/`, `template/` itself.
- **`git init` deferred** (project memory + seed.md §16) — the CLI must build, pack, audit in a non-git tree. Affects `.gitignore` semantics (still respected by rsync via `--exclude-from`?) but no `.git/` to query. `npm pack` does not require git.

## Patterns in use here

- **Bash + Python3 only** for hooks (per `seed.md`: "no jq"). Implementer should expect `python3` on PATH inside hook scripts. The CLI itself, by contrast, is **Node-only** — that's the explicit zero-dep selling point. Don't shell out to bash from `bin/cli.js`; use `node:fs`, `node:path`, `node:crypto`, `node:readline/promises`, `node:util`.
- **Shell scripts use `set -euo pipefail`** and source `lib/common.sh`. `scripts/build-template.sh` should follow this convention.
- **Skills follow a strict directory shape** (`.claude/skills/<name>/SKILL.md` + optional `template.md`, `references/`, `lib/` etc.). The CLI does not author skills; the build copies them wholesale.
- **Manifest format precedent** — `seed.md` and skill SKILL.md files use frontmatter (`---\nname: ...\n---`) parsed line-by-line. The CLI's `manifest.json` is JSON, not markdown — different family, but the project is comfortable with both.
- **Named-paths-only for any `git add`** (CLAUDE.md Art. VII) — affects future commit phase, not this CLI's own logic.
- **Overlay-onto-rsync** ordering for builds — rsync first (broad copy), then targeted `cp` overlays (narrow corrections). Same pattern shows up in `docs/create-baseline.md` §93–113.

## Risks / landmines

- **`src/` is dual-purpose.** The repo root's `src/` already contains the overlay templates (`*.template.*` and `agents/`, `memory/` subdirs). The CLI plan adds `*.js` source modules into the same `src/`. The build script excludes `src/` from rsync entirely, then overlays the `*.template.*` files individually — so the `.js` files never reach `template/` (correct behavior), but they do ship in the npm tarball via `package.json` `"files": ["src/", ...]`. The audit-baseline `src/` checks at `audit.sh:240-310` only verify the `*.template.*` files exist and are pristine; they do not assert anything about `*.js` siblings, so adding CLI modules here is safe per the current audit. **Spec must be explicit** about this dual purpose to prevent a future cleanup from "tidying" by moving the templates out.
- **Audit invariants are double-checked.** The constitution counts (17/36/1/4) are claimed in `CLAUDE.md`, `README.md`, `seed.md`, the dogfood `project.json`, AND the `src/CLAUDE.template.md` lede that ships ("17 hooks in `.claude/hooks/`"). Any drift in `template/` post-build that drops one of these will fail audit before pack. The build script's exclude list is the high-risk surface — an over-broad `--exclude` could drop a hook or skill silently.
- **`template/manifest.json` reflects post-overlay state.** Per design doc §114-115 the manifest hashes the *overlaid* files, not the live root. If the overlay step is skipped or misordered, the manifest will hash dogfood content (with `Generated:` stamps, `configured: true`, etc.) and shipped users get poisoned defaults that audit on their machine but match a wrong manifest. Critical ordering: rsync → overlay → manifest. Tests must catch ordering regressions.
- **First-merge degenerate case.** Per design doc §70: when a target has no `.baseline-manifest.json` (first-time `--merge`), every existing file is treated as customized → only new files added → many SKIPs reported. The CLI must surface a "recommend `--force` for clean reset" hint or users will think `--merge` is broken.
- **`.mcp.json` deep-merge is destructive on accidental shape change.** Currently the file's only top-level key is `mcpServers`. If a future baseline adds a peer key (e.g., `mcpDefaults`), the merge logic must be defensive — extending without overwriting user customizations of the new key.
- **`audit.sh` cross-doc count check (line 174 region).** The audit grep regex was tightened on 2026-04-28 to accept "17 hooks" as well as "seventeen hooks" (per seed.md §16 resolved follow-ups). The shipped `src/CLAUDE.template.md` (Article VIII) and `src/seed.template.md` already use the digit form; build overlay preserves them. Spec should not introduce a third form.
- **No git repo at this moment.** `npm publish` is not blocked by this (npm packs from disk), but any CI workflow that runs on `git push` is moot until `git init` happens. Spec should either tie the CLI ship to the git-init decision or explicitly defer CI to a follow-up.
- **`docs/intake/`, `docs/scout/`, `docs/research/`, `docs/specs/` — these dirs accumulate as the workflow runs.** This very report writes to `docs/scout/`. The build script's exclude list per design doc §90 covers these — but it lists the dirs by name, which means a future workflow phase that writes to a new doc subfolder (e.g., `docs/postmortem/`) won't be excluded automatically. Either generalize the exclude (everything under `docs/` except `docs/init/`) or accept the maintenance burden of adding new dirs as they arise. Spec call.
- **`bin/` collision with audit.** None — `audit.sh:396-403` does not yet check for `bin/` or `scripts/`. Adding `scripts/build-template.sh` to the helper-scripts list is a nice-to-have for `/document` phase; not required.
- **README dual-audience.** Currently 324 lines, single audience (project-facing — "what is this baseline"). Intake open question #1 calls out the npm-tarball reader will see this same file unless we point npm at a different one. `package.json` `"readme"` field is npm-tooling-specific and historically inconsistent; safest path per `/research` will be a dedicated `PUBLISH-README.md` referenced via `package.json` `"files"` and verified by `npm pack` inspection.
