## [0.8.2](https://github.com/friedbotstudio/baseline/compare/v0.8.1...v0.8.2) (2026-05-22)


### Bug Fixes

* **audit:** silently skip README.md count claims when file absent ([4e5395d](https://github.com/friedbotstudio/baseline/commit/4e5395df4e2abd1b07213a0808cfac995c3c86a4))
* **tui:** render BASELINE wordmark on install / upgrade / doctor ([7b630ce](https://github.com/friedbotstudio/baseline/commit/7b630ce00e13ba030ab04ec1ebd6f76c22cc8e33))
* **upgrade:** stop replay prompts on runtime-state files + post-reconciliation files ([558fab5](https://github.com/friedbotstudio/baseline/commit/558fab50726e5734b7ef58794cc49e9f61c14938))

## [0.8.1](https://github.com/friedbotstudio/baseline/compare/v0.8.0...v0.8.1) (2026-05-22)


### Bug Fixes

* **audit:** stop false-FAILing on consumer installs + bump commit_consent TTL to 900s ([ea66e1d](https://github.com/friedbotstudio/baseline/commit/ea66e1d21b973206fecc850e03f3b6d7d59f5a59)), closes [#5](https://github.com/friedbotstudio/baseline/issues/5)

# [0.8.0](https://github.com/friedbotstudio/baseline/compare/v0.7.0...v0.8.0) (2026-05-22)


### Features

* **cli:** tier-1 Merge option + BASE-less stage + /upgrade-project two-way reconciliation ([f1f4fc2](https://github.com/friedbotstudio/baseline/commit/f1f4fc2f592bf6ab47f6495fea99cd230389b405))

# [0.7.0](https://github.com/friedbotstudio/baseline/compare/v0.6.0...v0.7.0) (2026-05-21)


### Bug Fixes

* **cli:** surface tier-2/3 unrecoverable-BASE files in upgrade dry-run ([92e0d10](https://github.com/friedbotstudio/baseline/commit/92e0d10921224bd2059d06fbc5b0383d11386ddf))


### Features

* **workflows:** declarative track DAGs via workflows.jsonl (§18 + Article IV) ([cb1d511](https://github.com/friedbotstudio/baseline/commit/cb1d51116fe3ba6ec660fb6315335a12d60a589b))

# [0.6.0](https://github.com/friedbotstudio/baseline/compare/v0.5.0...v0.6.0) (2026-05-20)


### Bug Fixes

* **scripts:** smoke-tarball handles v3 shipped manifest {sha256, tier} entries ([6837992](https://github.com/friedbotstudio/baseline/commit/68379924902be1b3234217dad17b26f772e8507d))


### Features

* **cli:** three-tier upgrade flow + /upgrade-project skill ([3a82801](https://github.com/friedbotstudio/baseline/commit/3a828018a56e42e96f27d04d9adb63cf12289f21))

# [0.5.0](https://github.com/friedbotstudio/baseline/compare/v0.4.0...v0.5.0) (2026-05-20)


### Features

* **cli:** BASELINE wordmark splash + manifest relocation + branded error paths ([e2927c7](https://github.com/friedbotstudio/baseline/commit/e2927c7160dd3737ee164fa9d50c0d50eb0c196d)), closes [#080b12](https://github.com/friedbotstudio/baseline/issues/080b12)

# [0.4.0](https://github.com/friedbotstudio/baseline/compare/v0.3.0...v0.4.0) (2026-05-18)


### Features

* **cli:** branded TUI for install / upgrade / doctor + retire --merge ([71d5577](https://github.com/friedbotstudio/baseline/commit/71d5577a5baeb5863ac0bd274d1534185284e505))
* **site:** add brand byline + install-pill component + redesign hero ([490a4a6](https://github.com/friedbotstudio/baseline/commit/490a4a67c1158b8b2e7a2629b6aeee9225eb8f92))
* **workflow:** add Phase 11.5 changelog skill + responsive bento SVG ([db291ed](https://github.com/friedbotstudio/baseline/commit/db291ed0d3971bbde26bc7385d063225c0a7fd14))

# Changelog

All notable changes to this project will be documented in this file.

The format follows [keepachangelog.com 1.0.0](https://keepachangelog.com/en/1.0.0/). The `## [Unreleased]` section is curated locally by the Phase 11.5 `changelog` skill before each `/commit`; versioned sections are inserted by `@semantic-release/changelog` at release time.

## [Unreleased]

### Added

- `marker.mjs` shipped CLI helper at `.claude/skills/upgrade-project/marker.mjs` — Node ESM, stdlib only, byte-parity peer of `src/cli/reconciliation-marker.js → recordReconciliation`. Subcommand `record <target> <rel> <baseline_version> <template_sha>` writes `<target>/.claude/.baseline-reconciliations.json` atomically (write-then-rename via `randomUUID` tmpfile). Exit 0 success, 1 on filesystem error, 2 on bad args. Closes the v0.8.1-class bug where `/upgrade-project` invoked `node -e "import('./src/cli/reconciliation-marker.js')..."` against the target's cwd — consumer installs only receive `.claude/`, so every reconciliation hit `ERR_MODULE_NOT_FOUND` on the marker write. Spec: `docs/specs/marker-helper-shipped-instead-of-dev-import.md`.
- `scan-shipped-skills.mjs` aggregate scanner at `.claude/skills/spec-shippability-review/scan-shipped-skills.mjs` — re-validates the actual shipped `SKILL.md` content at build time (not just spec drafts). Walks `<root>/<slug>/SKILL.md` immediate children, runs C1 (`DEV_TREE_RUNTIME_REF`) + C3 (`UNSHIPPED_MODULE_IMPORT`) via the extracted shared `analyzer.mjs`. Supports `--shipped-tree <dir>` for build-time use when manifest.json is not yet stamped. Exit 0 CLEAN / 1 NEEDS_REVIEW / 2 BLOCKED / 3 missing root. Wired into `scripts/build-template.sh` Stage 1.6 between prune and template overlay; build aborts on exit 2/3 before manifest stamp so a regressed SKILL.md cannot reach npm.
- `analyzer.mjs` at `.claude/skills/spec-shippability-review/analyzer.mjs` — shared shippability domain helper extracted from `check.mjs`. Exports `collectShellFences(text)` (handles both column-0 tagged fences AND indented bash/sh/shell fences — the typical SKILL.md numbered-list shape the original column-0-only regex missed) and `runDevTreeAndUnshippedChecks(fences, manifest, sourcePath) → findings[]`. Consumed by both `check.mjs` (per-spec drafts) and `scan-shipped-skills.mjs` (aggregate scan).
- Three-tier upgrade flow for `create-baseline upgrade`: tier 1 binary prompt (with new "Keep your version / Use new baseline / Show diff" labels and a Show-diff re-prompt loop capped at two consecutive picks), tier 2 mechanical merge via `git merge-file --diff3` (auto-merges textually non-overlapping local + upstream changes), tier 3 semantic staging that writes BASE + INCOMING + a per-run manifest under `.claude/state/upgrade/<ts>/` for the new `/upgrade-project` Claude Code skill to reconcile.
- New `/upgrade-project` maintenance skill at `.claude/skills/upgrade-project/SKILL.md` (owner: baseline; 38 total skills, +1 maintenance category). Reads the staged BASE / INCOMING / LOCAL trio per pending file, reasons through three-way deltas in main context, writes reconciled bytes to LOCAL, deletes the stage on all-RECONCILED. Supports `args=dry-run` (emit unified diff, no writes). Fallback: `NEEDS_USER_INPUT` status with a targeted question when the LLM cannot disambiguate. Declares the **zero-drift renumbering rule** for structural conflicts (e.g. both sides add Article XI → user content shifts to next available slot, never folds — so the next upgrade produces zero new staging entries).
- `src/cli/upgrade-tiers.js` — new Domain module: `dispatchByTier`, `resolveBase` (hybrid local-cache + npm-fallback BASE recovery), `writeStage`, `findPendingStage`, `NoBaseError` with structured `kind` enum.
- `src/cli/diff-render.js` — new Foundation: LCS-based unified-diff renderer with optional ANSI colorize. Pure function, composable from any caller.
- `.claude/.baseline-prior/` cache directory written by `freshInstall` — mirrors the template tree so subsequent upgrades have BASE content for 3-way merge without a network round-trip. Per-directory `.gitignore` with `*` keeps the cache git-invisible.
- `baseline_version` field on the installed `.baseline-manifest.json` (read from CLI's own package.json at install time) so future upgrades can recover BASE via npm fallback when the cache is absent.
- Per-file tier classification in the shipped manifest (`obj/template/.claude/manifest.json`). Every entry is now `{sha256, tier}` instead of bare sha. SEMANTIC_EXPLICIT list (exhaustive): `docs/init/seed.md`, `CLAUDE.md`, `src/seed.template.md`, `src/CLAUDE.template.md`. Defaults: `.sh`/`.mjs`/`.js`/`.py`/`.ts`/`.md` → MECHANICAL; everything else → BINARY_PROMPT. Frontmatter `tier:` field overrides for the rare special case. README.md explicitly defaults to MECHANICAL (NOT SEMANTIC) per project-owner direction.
- New CLI exit codes: `4` = mechanical-merge conflicted (LOCAL on disk has `<<<<<<<` / `=======` / `>>>>>>>` markers); `5` = semantic-merge staging pending (`/upgrade-project` invocation expected).
- New `ACTION_KINDS` in `src/cli/merge.js`: `MECHANICAL_MERGE_CLEAN`, `MECHANICAL_MERGE_CONFLICTED`, `SEMANTIC_MERGE_STAGED`.

### Changed

- `.claude/skills/upgrade-project/SKILL.md` Procedure step 5 — invokes `node .claude/skills/upgrade-project/marker.mjs record <target> <rel> <baseline_version_to> <incoming_sha256>` instead of the broken `node -e "import('./src/cli/reconciliation-marker.js')..."`. Existing constraints around `.baseline-reconciliations.json`, dry-run no-write, and the SHALL NOT exception list are preserved verbatim.
- `.claude/skills/spec-shippability-review/check.mjs` — refactored to delegate C1 + C3 to `analyzer.mjs`. C2 (`DEV_HELPER_EXTENSION`) stays local since it scans write_set lines, not shell fences. The per-spec report JSON shape (`{slug, spec_path, verdict, generated_at, findings[]}`) is byte-identical to the pre-refactor shape, so `spec_approval_guard.sh` consumes it unchanged. All 4 existing fixture tests pass byte-equal after the refactor.
- TUI customization prompt verbiage replaced. The old labels `Keep mine` / `Take theirs` (git-rebase terminology that flips meaning depending on perspective) become `Keep your version` / `Use new baseline` / `Show diff` (installer-correct framing with diff preview).
- `bin/cli.js` help text updated from "three-way merge" to a three-tier description naming the new exit codes and the `/upgrade-project` reconciliation skill.
- `MANIFEST_VERSION` bumped from `1` to `2` on the installed manifest (`buildManifestFromDir` emits the new version; `baseline_version` field optional via opts arg). Shipped manifest bumped from `2` to `3` to carry the new per-file `{sha256, tier}` object shape. Consumer reads tolerate both shapes (bare sha → fall back to BINARY_PROMPT tier).
- `dispatchUpgrade` in `bin/cli.js` and `tui/upgrade.js → run()` short-circuit when `findPendingStage` returns non-null — re-invoking `upgrade` with a pending stage prints the same "run /upgrade-project" pointer without re-staging or re-prompting (idempotency AC-007).
- `audit-baseline.sh` handles both v2 (bare sha string) and v3 (`{sha256, tier}` object) manifest file entries — `expected_hash = entry if isinstance(entry, str) else entry.get('sha256')`.

### Security

- `extractFromTarball` in `src/cli/upgrade-tiers.js` adds a defensive `resolve(candidate).startsWith(tmpRoot + sep)` check after `tar -xz` extraction. Both `bsdtar` (macOS default) and GNU tar reject absolute paths and `..` components by default, but the explicit check makes the safety contract platform-agnostic and survives future tar-binary behavior changes. On escape, throws `NoBaseError{kind: 'tarball_path_traversal'}` which routes the file to the tier-1 binary-prompt fallback (never uses LOCAL as BASE).
- `/upgrade-project` skill body declares a path-validation constraint: before writing reconciled bytes to LOCAL, the skill must verify `path.resolve(target, rel)` is a descendant of target. Stage manifest `rel` values that escape route to `NEEDS_USER_INPUT` with reason `path-traversal-rejected` — defense in depth against a local attacker who has prior write access to `.claude/state/upgrade/`.
- npm registry trust boundary unchanged: tarballs fetched via `libnpmpack.pack('@friedbotstudio/create-baseline@<v>')` are sha256-verified against the consumer's installed manifest before being used as BASE. Mismatches throw `NoBaseError{kind: 'npm_sha_mismatch'}`. Legacy `manifest_version: 1` installs (no `baseline_version`) cannot recover BASE → tier-2/3 files route to tier-1 binary prompt with a one-time notice.

- BASELINE pixel-art wordmark splash for the CLI. New `src/cli/tui/splash.js` renders the wordmark in three bands of FBS orange (bevel: shadow / mid / highlight / mid / shadow) plus a thin `▔` outline trace. Surfaces: `--help` (splash + canonical HELP_TEXT), `--version` (wordmark + version line marquee), no-arg TTY landing (splash, exit 0), and slim brand strip on the install / upgrade intros (`▲ BASELINE v<ver> / <action>`). Non-TTY paths and narrow terminals (< 60 cols) degrade gracefully to the plain HELP_TEXT body. The docs-site CLI page (`site-src/cli.njk`) embeds a frozen PNG of the splash inside the existing `.install-snippet` terminal chrome; PNG background uses `#080b12` (sRGB of `oklch(15% 0.015 260)`) so it merges seamlessly with the site's `--code-bg`.
- New `paintRGB` + `PALETTE` exports on `src/cli/tui/tokens.js` plus a third `accentShadow` orange triple (`#7a2907` ≈ `oklch(35% 0.15 41.5)`) so the wordmark can paint each row in its bevel-band color.
- Regression test suites: `tests/splash.test.mjs` covers wordmark structure (6 rows: 5 letter bands + 1 outline trace), uniform width, `wordmarkFits()` thresholds (treats falsy `columns` as wide-enough so `script(1)` ptys still render the marquee), command-table presence, version-line absence (docs-PNG-staleness regression guard), and brand-strip composition. `tests/cli-tui.test.mjs` gained five regression tests asserting that every usage-class error (parseArgs failure, unknown flag, missing target, mutually-exclusive flags, existing-baseline conflict) prints `HELP_TEXT` after the branded error message — closing the `Error: Unknown option '--upgrade'` UX gap where Node's `parseArgs` noise leaked into stderr.
- Phase 11.5 `changelog` skill that curates per-commit entries under `## [Unreleased]` in this file before `/commit` stages the diff. Same `commit_consent` token authorizes both the changelog step and the commit step; no new gate. `--preview-only` mode prints the projected next version without writing files.
- Asymmetric bento composition for the architecture diagram on the public docs site. Single inline SVG, two layout regimes: bento at viewports wider than 768px and a vertical stack at narrower viewports. CSS custom properties carry the cell coordinates; `@media (max-width: 768px)` swaps the regime.
- `reinsertUnreleasedHeading` export in `unreleased-writer.mjs` as a release-time fallback. The `@semantic-release/changelog` plugin prepends release notes above existing headings; the export restores the canonical `# Changelog` then `## [Unreleased]` ordering at the top of the file.
- Branded terminal UI for the `create-baseline` CLI. New `src/cli/tui/{install,upgrade,doctor,tokens,meta}.js` modules render install / upgrade / doctor / help / version flows with Friedbot Studio brand colors (oklch palette translated to 24-bit truecolor ANSI), clack-style intro / spinner / outro framing, and interactive per-file conflict resolution on the new `upgrade` subcommand. Non-TTY invocations (CI / piped stdout) fall through to the prior plain output line-for-line; `@clack/prompts` is dynamic-imported only on the TTY path.
- New `create-baseline upgrade [target]` subcommand. In a TTY, presents each customized-stale file as a `keep-mine / take-theirs / abort` `select` prompt; in CI, reproduces the prior `--merge` behavior (exit 3 on any skipped customization).
- `create-baseline doctor --json` flag. Emits the structured `DoctorReport` as a single JSON line on stdout for CI consumers; honors `--strict`; exit codes unchanged.
- Single pinned runtime dependency, `@clack/prompts@1.4.0`. First runtime dep this package has ever shipped; transitive closure is six packages (`@clack/core`, `fast-wrap-ansi`, `fast-string-width`, `fast-string-truncated-width`, `sisteransi`), all under reputable maintenance, `npm audit` clean at adoption time. The `DEPS_ALLOWLIST` constant in `scripts/check-files-diff.mjs` is the supply-chain contract that gates future additions.

### Changed

- Shipped manifest relocated from `obj/template/manifest.json` (template root) to `obj/template/.claude/manifest.json` (inside the `.claude/` subtree). The recursive install now delivers it directly to `<target>/.claude/manifest.json` with no special-case copy step, fixing both the visual clutter of a top-level `manifest.json` in consumer projects AND the consumer-side audit's hash-drift detection (`audit-baseline/audit.sh` reads the manifest from `<root>/.claude/manifest.json` first, with a fallback to `obj/template/.claude/manifest.json` for the dev repo). CLAUDE.md Article XI, `seed.md` §17, and their `src/*.template.md` byte-mirrors all carry the new path. `COPY_EXCLUDE` is now empty (the previous `manifest.json` exclusion is no longer needed — the manifest lives inside `.claude/` so the recursive walk picks it up at the same path the consumer expects). Legacy-buggy installs that already have a stray `target/manifest.json` at root from a prior upgrade get it auto-pruned on the next upgrade (newFiles lacks the top-level path; oldFiles has it; threeWayMerge takes the PRUNE branch).
- Every usage-class error in the CLI now flows through a single `usageError(msg)` helper in `bin/cli.js` that routes to `meta.renderUsageError` — branded banner + `Error: <msg>` + canonical HELP_TEXT, all to stderr. The parseArgs catch translates `Unknown option '--upgrade'` into a friendly "Did you mean `create-baseline upgrade <target>`? `upgrade` is a subcommand, not a flag." hint (and same for `--doctor`). Help-text accompanies every non-success exit so users always see usage guidance alongside the failure.
- CLAUDE.md Article IV phase table grew a Phase 11.5 sub-row mirroring the 10.5 and 10.6 pattern.
- `commit/SKILL.md` prereq line tightened from "BOTH archive AND memory-flush" to "ALL of archive AND memory-flush AND changelog".
- `harness/SKILL.md` phase ordering text and state-machine resume table now name the changelog step between `/grant-commit` and `commit`.
- `triage/SKILL.md` four task-seeding templates (chore, tdd-entry, spec-entry, intake-entry) now insert a `Run /changelog` task between `Wait for /grant-commit` and `Run /commit`. Non-git projects auto-except `changelog` alongside `commit`.
- `CHANGELOG.md` migrated to keepachangelog 1.0.0 format. Version blocks moved from `# [version]` (single hash) to `## [version]` (double hash); the file gained a top-level `# Changelog` heading and a `## [Unreleased]` section.
- `scripts/build-template.sh` audit step moved from Stage 0 to after the manifest rebuild, closing a chicken-and-egg loop on any workflow that edits baseline-owned `SKILL.md` files.
- `package.json` description retired the "Zero-dependency Node CLI scaffolder" claim. The package now ships exactly one runtime dependency (see Added above) and the description reflects the branded interactive flows.
- `src/cli/merge.js → threeWayMerge` grew an opts object: `{dryRun, onSkipCustomized}`. Default behavior is unchanged; `onSkipCustomized` lets the upgrade TUI resolve `SKIP_CUSTOMIZED` actions via user prompts and reclassify them as `OVERWRITE` when the user picks "take-theirs".
- `bin/cli.js` argv parser dropped `merge` from its option set. `--help`, `--version`, install, upgrade, and doctor each route to a branded path when `process.stdout.isTTY` is true and to today's plain output when false. The router uses dynamic `await import('../src/cli/tui/*.js')` so clack never loads on the non-TTY path.
- README.md and the docs site (`site-src/install.njk`, `site-src/cli.njk`) updated to describe the `upgrade` subcommand, the retired `--merge` flag, the `doctor --json` mode, and the new runtime-dependency posture. The site copy ran through the `humanizer` pass per Article X.1 user-facing-copy discipline.

### Removed

- `--merge` flag retired. Passing it now exits 2 with a stderr line pointing the user to `create-baseline upgrade <target>`. The semantics are preserved on the new subcommand; only the surface changed.
- Pre-1.0 break per `.releaserc.json` `releaseRules` (maps `breaking: true` to a minor bump while on 0.x).

### Fixed

- Test discipline note for fixture-based bash tests with `out="$(cmd)" || true` patterns: the `|| true` clobbers `$?` to zero regardless of what the command returned. The `consent-expired_test.sh` rewrite drops `|| true` and reads `$?` directly; `set -uo pipefail` (no `-e`) propagates the exit code without aborting the test.
- `doctor` error-path rendering. When the target lacks `.claude/.baseline-manifest.json`, the TTY path now renders the same `Baseline doctor` brand frame as the success path (target line in muted ink, error line with red `doctor:` marker) instead of falling through to the plain renderer. The router no longer short-circuits errors away from the TUI.

## [0.3.0](https://github.com/friedbotstudio/baseline/compare/v0.2.1...v0.3.0) (2026-05-17)


### Bug Fixes

* **audit:** allow preamble-only canonical memory files ([db0221b](https://github.com/friedbotstudio/baseline/commit/db0221b53f1a6575fbb9e86cf6d203fa6039c9ed))
* **audit:** require closing separator in canonical memory preambles ([e6ca9b6](https://github.com/friedbotstudio/baseline/commit/e6ca9b63bbee46bcfa24a720b101f4d13a924a59))


### Features

* **design-ui:** add mixed_brief Stage 0 terminal for multi-lane briefs ([be2d941](https://github.com/friedbotstudio/baseline/commit/be2d94122fe58475c12c642126345978c713f223))
* drift-check tick, backlog auto-flip, ac008 fixture regen ([bfad579](https://github.com/friedbotstudio/baseline/commit/bfad579c8477f813c8aa7b8a30778d3ebd2050cf))
* **harness:** auto-resume across consent gates via Stop-hook rung 4 ([1333cb7](https://github.com/friedbotstudio/baseline/commit/1333cb7bdf3d451ddfac70cdc3bfb8e56db33819))
* **hooks:** branch-aware git consent policy with /grant-push gate ([3a3314e](https://github.com/friedbotstudio/baseline/commit/3a3314ebe18c342e77d1b39c932e202985461a2e))
* **init-project:** explicit gate at Step 5 review surface ([5a79b1c](https://github.com/friedbotstudio/baseline/commit/5a79b1cb95204e7ab8d815e97425bf1709ab91ba))
* **memory:** add backlog bucket for future-work intent extraction ([54a9235](https://github.com/friedbotstudio/baseline/commit/54a923512cd620e35d5450441ad85fa829bd796a))
* **workflow:** add /memory-flush as workflow Phase 10.6 (end-of-workflow memory curation) ([a3c55f8](https://github.com/friedbotstudio/baseline/commit/a3c55f89d9d97a6debc8e722df918280826d0892))

## [0.2.1](https://github.com/friedbotstudio/baseline/compare/v0.2.0...v0.2.1) (2026-05-14)


### Bug Fixes

* **release:** release refactors and constitution scope changes ([149e415](https://github.com/friedbotstudio/baseline/commit/149e4157c4da749c9cfba5b96374a81ab24343a0))


### Features

* **site:** wire Google Analytics 4 into the Friedbot Studio site ([14f06f6](https://github.com/friedbotstudio/baseline/commit/14f06f6ad7acc38ccc3674899e13d9519e9b12f0))

## [0.2.0](https://github.com/friedbotstudio/baseline/compare/v0.1.0...v0.2.0) (2026-05-14)


### Bug Fixes

* **cli:** exclude manifest.json from install copy + make .npmrc opt-in ([ae351e2](https://github.com/friedbotstudio/baseline/commit/ae351e2d56702218588b294eb028f0abbef02970))
* **release:** revert branches range modifier (semantic-release ERELEASEBRANCHES) ([06f79a4](https://github.com/friedbotstudio/baseline/commit/06f79a4ba523c787250364055e4a44572a5f4b2d))


### chore

* **release:** cap main at 0.x + breaking → minor (alpha safety belt) ([0682a28](https://github.com/friedbotstudio/baseline/commit/0682a2838df68e7690f776bf8d1a03b0ba2aaec4))


### BREAKING CHANGES

* **release:** / feat! commits from default major to minor so they
actually cut a release within 0.x (0.N → 0.N+1) instead of being silently
skipped by the cap.

Net effect during alpha: feat → minor; fix → patch; feat! / BREAKING
CHANGE → minor (the 0.x semver convention); chore(release / site / ci /
actions) and build → no release (existing rules). When ready for 1.0,
remove both modifications in one chore.

The corresponding release-workflow test (test_when_releaserc_parsed_then_branches_is_main_capped_at_0x_and_next_prerelease,
renamed from the plain-main predecessor) was updated to assert the new
branches shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
