# Codebase Scout Report — reduce-test-suite-runtime

> **Headline (premise has shifted since the backlog was written).** The backlog item (raised 2026-06-02 @ `2afb07c`) describes the suite as "pinned to `--test-concurrency=1`, ~459s." **At current HEAD that is no longer true.** Measured this session: `node --test tests/*.test.mjs` runs in **93.85s real** (user 214.94s + sys 174.77s — i.e. already running in parallel across the 16 cores), **green** (exit 0, no failures). There is **no `--test-concurrency=1` pin** anywhere (`git log -S test-concurrency -- package.json` is empty — it was never in `package.json`), and the tmpdir-isolation work that lever 1 depended on is **already done**. The job left is no longer "make it parallel"; it is "shave a parallel ~94s suite toward ~60s." Research should re-baseline against this number, not 459s.

## Primary touchpoints

- `package.json:scripts.test` — `node --test --test-reporter=spec tests/*.test.mjs`. The full-suite entry point. **No concurrency flag** → node:test default (parallel file execution across workers). This is the de-facto local correctness gate.
- `scripts/build-template.sh:1` — the expensive unit. Per invocation: TMPDIR-global `mkdir` mutex (lines ~25-35), Stage 0a/0b seeding + vendored-mirror sync, bulk rsync of `.claude/`, overlay of `src/*.template.*`, manifest stamp, and an audit pass. Invoked by 17 test files (see below). Holds a portable `mkdir` mutex so concurrent isolated builds serialize rather than corrupt.
- `scripts/build-manifest.mjs` — reads + sha256s ~260 files to stamp `obj/template/manifest.json` (lever 3 target: the audit then re-hashes the same files).
- `.claude/skills/audit-baseline/audit.mjs` — the drift audit run at the tail of `build-template.sh` Stage 4; re-hashes the manifest files a second time (the redundant re-hash lever 3 names).
- `tests/helpers/clone-and-build.mjs` — **the isolation primitive, already built and in use.** `cloneAndBuild(label)` rsyncs the repo (minus node_modules/obj/.git/docs/archive) into a fresh `mkdtemp` and runs `build-template.sh` there with `PKG_ROOT`/`CLAUDE_PROJECT_DIR` overridden, so a test reads ITS OWN `obj/template`. `buildShippedClaudeDir(label)` returns the built `.claude/` subtree.

## Entry points that reach this code

- **Local:** `npm test` → `node --test tests/*.test.mjs` (the suite under optimization). This is where the pain is felt (brief: developer inner loop).
- **CI:** `.github/workflows/release.yml` runs `npm run publish:check`, `npx semantic-release`, and `npm run build:site` — it does **NOT** run the `node --test` suite. So the suite is a *local* gate; "CI parity" (intake non-goal #3) is about the publish-check path, not a CI run of this suite.
- `npm run build` / `prepack` → `bash scripts/build-template.sh` (same script the tests exercise).

## Existing tests

Two cost clusters dominate the surface.

**(A) Build-exercising tests — 17 files invoke `build-template.sh` (directly or via `cloneAndBuild`).** All verified to build into an **isolated tmpdir** (via `PKG_ROOT` override or `cloneAndBuild`); none rm -rf or rebuild the live `REPO_ROOT/obj/template`:
- `build-template.test.mjs` (PKG_ROOT→tmp fixture), `audit-baseline-post-amendment`, `build-template-mirror-sync`, `build-template-build-id`, `build-audit-gate`, `build-shipped-skills-gate`, `install`, `memory-flush-phase`, `whatsnew-counts`, `shipped-tree-no-dev-refs`, `publish-check`, `workflows-install-upgrade`, `skill-ownership`, `template-drift`, `template-payload`, `vendored-mirror-bytes`, `upgrade-project`.
- `manifest.test.mjs` already memoizes one build per file via a module-level `_builtPromise ??= cloneAndBuild(...)`. node:test isolates files in **separate processes**, so this sharing does **not** cross files — each of the 17 files pays its own build. This is the structural reason a per-suite single build (lever 2) needs an out-of-process mechanism (global-setup / prebuilt fixture), not just a JS promise.

**(B) Network/npm-heavy tests — 8 files** (lever 4 candidates; `npm pack`/install/tarball/eleventy): `check-files-diff`, `build-audit-gate`, `ga4-built-site` (builds `obj/site` via eleventy), `npm-pack-tarball`, `publish-check`, `site-relative-paths`, `release-workflow`, `smoke-tarball`. These rarely change and are the heaviest single tests.

Total: **139 test files**, all green at HEAD. The 6 JVM PlantUML tests are already gated behind `PLANTUML_TESTS=1` (Part A) and are not in the default run.

## Constraints and co-changes

- **`package.json:scripts.test`** — the place any concurrency/setup flag would land (e.g. `--test-global-setup`). Node is **v25.8.1**, 16 cores — modern enough that `--test-global-setup` and friends are available (research to confirm stability/semantics).
- **Live `obj/template` is still mutable shared state in principle** — `build-template.sh`/`prepack` rebuild it for real builds. The tests no longer touch it, but a lever-2 "build once into a shared fixture" must not reintroduce a path where a test reads the live tree mid-rebuild. The `mkdir` mutex in `build-template.sh` is the existing guard.
- **`audit-baseline`** is the verify/integrate verdict source (`project.json → test.cmd`). Lever 3 (skip the redundant Stage-4 re-hash) must not weaken what the audit asserts (intake non-goal: same verdict fidelity).
- No global setup / `--import` / `--require` is currently wired (grep empty) — a new mechanism, not a modification of an existing one.

## Patterns in use here

Tests that need a built tree follow one of two established idioms: (1) `mkdtemp` + `spawnSync('bash', [build-template.sh], {env:{PKG_ROOT:tmp}})`, or (2) `import { cloneAndBuild } from './helpers/clone-and-build.mjs'`. New work should extend these idioms (e.g. a shared prebuilt fixture the read-only tests point at) rather than invent a third. Env-gating precedent already exists: `PLANTUML_TESTS=1` gates the JVM tests — lever 4 would mirror that exact pattern.

## Risks / landmines

- **Stale premise (the big one).** The backlog's "~459s, serial pin" framing is obsolete; building a spec around lever 1 ("lift the concurrency pin") would be solving an already-solved problem. Research must re-anchor on the live ~94s.
- **Cross-file build sharing is non-trivial.** node:test runs each file in its own process, so the dominant remaining cost (17 × full build) cannot be collapsed with an in-process cache — it needs `--test-global-setup` building a shared fixture to a known path that read-only tests consume, with mutating tests still cloning from it. This is the load-bearing design question for research.
- **Diminishing returns / measurement noise.** At ~94s, machine variance (user 214s/sys 174s shows heavy I/O from rsync+sha256) may swamp small wins. Per-file timing should drive prioritization rather than the stale Part-A serial offender list.
- **`landmines.md → live-objtemplate-rebuild-races-parallel-test-readers`** documents the original race; it should be re-verified (and likely updated to "mitigated — all tests isolated") during this work.
- Lever 4's network tests gate `publish:check`, which **is** the CI path — env-gating them locally must keep them running in CI (intake non-goal #3: no CI/local divergence).
