# [0.4.0](https://github.com/friedbotstudio/baseline/compare/v0.3.0...v0.4.0) (2026-05-18)


### Features

* **cli:** branded TUI for install / upgrade / doctor + retire --merge ([71d5577](https://github.com/friedbotstudio/baseline/commit/71d5577a5baeb5863ac0bd274d1534185284e505))
* **site:** add brand byline + install-pill component + redesign hero ([490a4a6](https://github.com/friedbotstudio/baseline/commit/490a4a67c1158b8b2e7a2629b6aeee9225eb8f92))
* **workflow:** add Phase 11.5 changelog skill + responsive bento SVG ([db291ed](https://github.com/friedbotstudio/baseline/commit/db291ed0d3971bbde26bc7385d063225c0a7fd14))

# Changelog

All notable changes to this project will be documented in this file.

The format follows [keepachangelog.com 1.0.0](https://keepachangelog.com/en/1.0.0/). The `## [Unreleased]` section is curated locally by the Phase 11.5 `changelog` skill before each `/commit`; versioned sections are inserted by `@semantic-release/changelog` at release time.

### Added

- branded TUI for install / upgrade / doctor + retire --merge
- add Phase 11.5 changelog skill + responsive bento SVG

## [Unreleased]

### Added

- Phase 11.5 `changelog` skill that curates per-commit entries under `## [Unreleased]` in this file before `/commit` stages the diff. Same `commit_consent` token authorizes both the changelog step and the commit step; no new gate. `--preview-only` mode prints the projected next version without writing files.
- Asymmetric bento composition for the architecture diagram on the public docs site. Single inline SVG, two layout regimes: bento at viewports wider than 768px and a vertical stack at narrower viewports. CSS custom properties carry the cell coordinates; `@media (max-width: 768px)` swaps the regime.
- `reinsertUnreleasedHeading` export in `unreleased-writer.mjs` as a release-time fallback. The `@semantic-release/changelog` plugin prepends release notes above existing headings; the export restores the canonical `# Changelog` then `## [Unreleased]` ordering at the top of the file.
- Branded terminal UI for the `create-baseline` CLI. New `src/cli/tui/{install,upgrade,doctor,tokens,meta}.js` modules render install / upgrade / doctor / help / version flows with Friedbot Studio brand colors (oklch palette translated to 24-bit truecolor ANSI), clack-style intro / spinner / outro framing, and interactive per-file conflict resolution on the new `upgrade` subcommand. Non-TTY invocations (CI / piped stdout) fall through to the prior plain output line-for-line; `@clack/prompts` is dynamic-imported only on the TTY path.
- New `create-baseline upgrade [target]` subcommand. In a TTY, presents each customized-stale file as a `keep-mine / take-theirs / abort` `select` prompt; in CI, reproduces the prior `--merge` behavior (exit 3 on any skipped customization).
- `create-baseline doctor --json` flag. Emits the structured `DoctorReport` as a single JSON line on stdout for CI consumers; honors `--strict`; exit codes unchanged.
- Single pinned runtime dependency, `@clack/prompts@1.4.0`. First runtime dep this package has ever shipped; transitive closure is six packages (`@clack/core`, `fast-wrap-ansi`, `fast-string-width`, `fast-string-truncated-width`, `sisteransi`), all under reputable maintenance, `npm audit` clean at adoption time. The `DEPS_ALLOWLIST` constant in `scripts/check-files-diff.mjs` is the supply-chain contract that gates future additions.

### Changed

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
