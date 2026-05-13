# Codebase Scout Report — npm-publish-prep

## Primary touchpoints

- `package.json:1-37` — declares `name: create-baseline`, `version: 0.1.0`, `bin: bin/cli.js`, `files: ["bin/", "src/", "obj/template/", "README.md"]`, `prepack: bash scripts/build-template.sh`, `engines.node: >=18.17.0`, `type: module`, zero `dependencies`. **This is the contract the publish:check must verify against.**
- `bin/cli.js:1-243` — CLI entry. Imports from `src/cli/*.js`; calls `freshInstall` / `forceInstall` / `threeWayMerge` / `runDoctor`. Reads `obj/template/manifest.json` at install time (the published `.tgz` must contain it).
- `scripts/build-template.sh:1-90` — `prepack` hook. Three stages: (0) audit-baseline gate fails build on polluted src/, (1) `rsync -a --exclude=state/ --exclude=settings.local.json --exclude=bin/plantuml.jar --exclude=memory/_pending.md --exclude=memory/_resume.md .claude/ → obj/template/.claude/`, (2) overlay pristine `src/*.template.*` into `obj/template/`, (3) `node scripts/build-manifest.mjs obj/template/` to stamp `manifest.json`.
- `scripts/build-manifest.mjs` — emits `obj/template/manifest.json` with `{manifest_version, generated_at, files: {<path>: <sha256>}, owners: {skills: {<slug>: "baseline"}}}`. Currently 165 files, 36 baseline skill slugs.
- `obj/template/manifest.json` — the merge contract. Consumed by `bin/cli.js → loadManifest()` and by `audit-baseline` for drift detection (CLAUDE.md Article XI).

## Entry points that reach this code

- **CLI**: `npx create-baseline <target>` → `bin/cli.js` (resolved via `package.json → bin`).
- **Build hook**: `npm pack` and `npm publish` → trigger `prepack` → `bash scripts/build-template.sh` (the audit-baseline gate runs first; build aborts on FAIL).
- **No HTTP / no cron / no queue.** This is a CLI-only npm package.

## Existing tests

All currently passing per the prior workflow's `/integrate` (128/128 node tests as of `skill-ownership` completion 2026-05-12T18:44:11Z). Tests run via `npm test` → `node --test --test-reporter=spec tests/*.test.mjs`.

- `tests/npm-pack-tarball.test.mjs` — **1 test, the only existing publish-adjacent coverage.** Runs `npm pack --dry-run --json` from repo root, asserts `parsed[0].files` contains zero paths starting with `site/`. Does NOT verify required paths are present, does NOT install + execute the tarball, does NOT exercise `prepack`. The intake's smoke + files-diff ACs are net-new coverage adjacent to this file's existing shape.
- `tests/template-payload.test.mjs` — **passes when `obj/template/` has been built.** Asserts the built tree matches an explicit `ALLOWED_PREFIXES` allowlist (`.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`, `manifest.json`) and that required components are present (20 hooks, 36 skills, 4 commands, 6 memory schemas, swarm-worker agent, LICENSE+NOTICE). **This is the closest existing analog** to the intake's files-diff AC, but it audits the staged build output, not the actual `npm pack` tarball.
- `tests/build-audit-gate.test.mjs` — verifies `build-template.sh` exits non-zero when `src/` invariants are violated (seed §16 stamped, swarm-worker placeholder dropped, etc.). Defends the prepack gate.
- `tests/cli.test.mjs`, `tests/install.test.mjs` — exercise `bin/cli.js` against tmpdirs using `mktemp`-equivalent (`fs/promises.mkdtemp` + `os.tmpdir`). Patterns the smoke-test should follow.
- `tests/manifest.test.mjs`, `tests/skill-ownership.test.mjs` — exercise `obj/template/manifest.json` shape and `owners.skills` content.
- 22 total `.test.mjs` files. None install from a packed `.tgz` end-to-end.

## Constraints and co-changes

- **`files:` allowlist ↔ `build-template.sh` rsync inputs.** The build script's stage-1 rsync writes into `obj/template/.claude/`, and stage 2 overlays `src/` templates. `package.json → files:` must enumerate every top-level dir these writes touch (currently: `bin/`, `src/`, `obj/template/`, `README.md`). Adding a new top-level baseline file requires updating both. The intake's "files-diff" AC is precisely a guard for this co-change.
- **`prepack` is load-bearing.** `npm pack`/`npm publish` runs it; `npm pack --dry-run` does NOT (verify — see Risks). The smoke test must run against a tarball produced by a real `npm pack` (not `--dry-run`), and must time-budget for the audit-baseline gate.
- **`audit-baseline` reads `obj/template/manifest.json`** (per CLAUDE.md Article XI, via `manifest.owners.skills`). If the manifest is stale or the build is skipped, audit-baseline FAILs the prepack gate.
- **Project is non-git** (Article IV/VII apply). `npm version` typically wants a clean git tree; the runbook must call out manual version-bump editing in `package.json` since `npm version <bump>` will fail without `.git/`.
- **`repository.url` in package.json points at `github.com/friedbotstudio/baseline.git`** which has no live state right now. Not a publish blocker (`npm publish` doesn't validate the URL is reachable), but the runbook should note this discrepancy so future publishers don't assume a CI gate exists.
- **No `.npmignore` exists.** With `files:` declared, `.npmignore` is unnecessary; the allowlist wins. The runbook should document that any future `.npmignore` would silently invert the allowlist semantics.
- **`node_modules/` exists at the repo root** (devDependencies installed). `npm pack` excludes it by default but the smoke test should run `npm ci` or skip-install patterns appropriately when installing the tarball into a tmpdir.

## Patterns in use here

- **Test style**: ESM, `node:test`, `node:assert/strict`, top-of-file `const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))`. Tmpdirs via `mkdtemp(join(tmpdir(), 'prefix-'))`. Shell-outs via `execSync` (one-shot capture) or `execFileSync` (no shell parsing).
- **Build script style**: `set -euo pipefail` bash; `$PKG_ROOT` resolved once at top via `cd "$SCRIPT_DIR/.." && pwd`; comments explain WHY each `--exclude` exists.
- **Build outputs live under `obj/`** (per package.json comment in `build-template.sh:18-19`). New `publish:check` outputs (e.g., temp tarballs, smoke-test workspaces) should land under `obj/` or `mktemp`, never beside source.
- **No transpilation, no TypeScript.** Pure ESM `.mjs` for scripts and tests, `.js` for `bin/` and `src/cli/`. The publish:check tooling follows.
- **Existing `npm pack --dry-run --json` parser** in `npm-pack-tarball.test.mjs:9-14` is the canonical shape; new code that needs the same parse should match the existing error-handling.

## Risks / landmines

- **`npm pack --dry-run` may not run `prepack`.** Verify in `/research` against current npm CLI behavior via context7 — if `--dry-run` skips lifecycle scripts, the existing `npm-pack-tarball.test.mjs` is auditing a *partially-built* template. The smoke test must use real `npm pack` (no `--dry-run`) to exercise the real ship path.
- **Smoke test cost.** A real `npm pack` runs `prepack` which runs `audit-baseline` (file-tree walk + sha256 over 165 files) plus the full `build-template.sh` rsync. Probably 2–5 seconds. The smoke test then `npm install`s the tarball into a tmpdir and invokes `npx create-baseline`. Multi-second test; budget accordingly so `npm run publish:check` stays under ~30 seconds total.
- **Tarball name collision.** `npm pack` writes `create-baseline-0.1.0.tgz` to CWD. Running concurrent verifications would race. The smoke test should `npm pack --pack-destination <tmpdir>` (npm 7+) or `cd` into a workspace per invocation.
- **`node_modules/` in tmpdir.** Installing `.tgz` via `npm install ./create-baseline-0.1.0.tgz` triggers a full npm install in the tmpdir. With zero `dependencies` declared this is fast (just the `bin` symlink), but the test must not inherit the dev-repo's `package-lock.json`.
- **`obj/template/manifest.json:generated_at`** is a wall-clock timestamp. Two consecutive builds produce different manifest.json sha256s. The files-diff check should compare `files:`-declared paths vs `npm pack --json` output, NOT compare manifest hashes across builds.
- **`obj/site/` and `obj/site-review/` exist at the repo root** (eleventy build outputs). They are NOT in `files:` so they shouldn't ship; the existing `npm-pack-tarball.test.mjs` already guards the `site/` prefix, but a stale `obj/site-review/` could leak if `obj/` (not `obj/template/`) were ever added to `files:`. Runbook should warn against broadening `files:` to bare `obj/`.
- **`npm unpublish` 72-hour policy.** Per current npm docs (verify in `/research` via context7), a freshly published version can be unpublished within 72 hours; after that, only `npm deprecate` is available. Runbook must capture both paths.
- **`prepack` runs from `package.json`'s directory**, not the user's CWD. If a future contributor invokes the build from elsewhere, paths break. Existing script already handles this via `SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)`.
- **No CHANGELOG.md exists.** Not blocking the first publish, but the runbook should note where to record version-bump rationale (suggest `docs/release-notes/<version>.md` consistent with the existing `docs/` taxonomy, or defer to a follow-up workflow).
