# Codebase Scout Report — Scope the installed baseline manifest to shipped files only

## Reconcile delta (workspace corpus)

`node .claude/skills/workspace/cli.mjs reconcile --touched src/cli/install.js,tests/install.test.mjs --json` → mode `reconcile`, delta `changed: ["cli-core"]`, `unreferenced: []`. The corpus already maps this slice under the `cli-core` element; no rediscovery needed. No dangling or in-slice-resolved tracking annotations on `install.js` (`workspace annotations --json` → 0 dangling, 0 resolved for this file).

## Primary touchpoints

- `src/cli/install.js:42-52` — `listFiles(root, base, acc)`: unfiltered recursive `readdir`. Root cause. Currently called only as `listFiles(target)`.
- `src/cli/install.js:64-72` — `writeBaselineManifest(target, baseline_version)`: builds the filter list (`filtered`) and calls `buildManifestFromDir(target, filtered, {baseline_version})`. Needs to become `writeBaselineManifest(templateDir, target, baseline_version)` and walk `templateDir` instead of `target`.
- `src/cli/install.js:180-195` and `197-212` — `freshInstall` / `forceInstall`: both already have `templateDir` in scope and both call `writeBaselineManifest(target, baseline_version)` as their last step before `refreshBaselineVersion`. Call sites need the new argument.
- `src/cli/install.js:40` — `COPY_EXCLUDE` (currently empty array, exported). The shipped-file walk should filter through it, matching the convention `bin/cli.js:124-134` and `src/cli/tui/upgrade.js:212-219` already use for template-dir walks.
- `src/cli/manifest.js:27-40` — `buildManifestFromDir(rootDir, fileList, opts)`: takes an explicit `fileList` and hashes each entry from `rootDir`. No change needed — it's already the right shape; `writeBaselineManifest` just needs to hand it the correct `fileList`.
- `src/cli/merge.js:161-174` — the prune branch that deletes files present in `oldManifest.files` but absent from `newManifest.files` when unchanged since capture. No change needed once the manifest stops recording non-shipped paths — this is the blast site, not the cause.

## Entry points that reach this code

- `bin/cli.js:172-177` (`dispatchInstall`) → `runBrandedInstall` / `runPlainInstall` → `freshInstall` / `forceInstall` (`install.js`), the CLI's `create-baseline install`/`init` path.
- `src/cli/tui/install.js:7` imports `freshInstall`, `forceInstall` for the branded TUI install flow, same underlying calls.
- Indirectly: `bin/cli.js:290-313` (`runPlainUpgrade`) and `src/cli/tui/upgrade.js:37-121` (`run`) both read `.claude/.baseline-manifest.json` as `oldManifest` via `loadManifest` and feed it into `threeWayMerge` — this is where a bad manifest from install time causes upgrade-time deletion. Neither needs code changes for this fix; they just consume the corrected manifest once install writes it correctly.

## Existing tests

- `tests/install.test.mjs` — covers `freshInstall`/`forceInstall` behavior (NEVER_TOUCH, SPECIAL_MERGE, `.baseline-prior` mirror, CI posture opt-out). No existing case installs into a target with pre-existing foreign files or a `.git/` directory — this is the gap the new test fills. All passing as of HEAD.
- `tests/ci-posture.test.mjs` — exercises `freshInstall` with `ciPosture: false`; relevant because the manifest-scoping fix must still skip CI-posture files that never get copied to target (parity check).
- `tests/upgrade.test.mjs`, `tests/upgrade-fast-path.test.mjs`, `tests/upgrade-pending-precedence.test.mjs`, `tests/upgrade-version-stamp.test.mjs`, `tests/upgrade-legacy-migration.test.mjs` — exercise the upgrade path against manifests built by `install.js`; none currently simulate a foreign-file-in-manifest scenario, so none currently catch this bug either.
- `tests/never-touch-sync.test.mjs`, `tests/output-style-default.test.mjs` — import `NEVER_TOUCH`/`SPECIAL_MERGE` from `install.js` directly; unaffected by this fix (those constants and their handling in `applySpecialAndNeverTouch` are untouched).

## Constraints and co-changes

- `writeBaselineManifest` is not exported from `install.js` and has no external callers besides `freshInstall`/`forceInstall` in the same file — signature change is self-contained.
- `buildManifestFromDir(rootDir, fileList, opts)` (`manifest.js:27`) stays untouched; the fix is entirely about what `fileList` gets passed in.
- `pathExists` (`src/cli/util.js`, already imported in `install.js:8`) is available for the target-existence filter the new `writeBaselineManifest` needs (a shipped file may not have been copied — e.g. CI-posture opt-out — and must not appear in the manifest if absent from `target`).
- Precedent for the "walk templateDir, filter by COPY_EXCLUDE" pattern already exists twice: `bin/cli.js:124-134` (`listShippedFiles`) and `src/cli/tui/upgrade.js:212-219` (same function, duplicated). The fix in `install.js` should follow the same shape rather than introduce a third variant.

## Patterns in use here

`install.js` keeps every filesystem-touching helper as a small unexported async function composed inside `freshInstall`/`forceInstall`; nothing is a class or holds state across calls. Path filtering elsewhere in the file (`makeFilter`, `applySpecialAndNeverTouch`) always operates relative to `templateDir`/`opts.templateRoot`, never `target` — `listFiles(target)` in `writeBaselineManifest` is the one outlier that walks the wrong tree.

## Risks / landmines

- `listFiles` is also structurally capable of recursing into deeply nested or symlinked directories under `target` (e.g. `node_modules/`, build output). None of that is exercised by current tests, and the same unfiltered-walk risk applies to any large or unusual directory a consumer's target might contain — not just `.git/` and the five reported source files. The fix removes the entire class by no longer walking `target` for the shipped-file list.
- The bug is silent by design: a bad manifest write produces no error, no test failure, and no visible symptom until the *next* upgrade runs and deletes files — which is why it shipped unnoticed. The new test must exercise the two-step sequence (install, then upgrade) to actually catch a regression, not just assert on the manifest's shape in isolation.
