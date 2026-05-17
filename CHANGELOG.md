# [0.3.0](https://github.com/friedbotstudio/baseline/compare/v0.2.1...v0.3.0) (2026-05-17)


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

# [0.2.0](https://github.com/friedbotstudio/baseline/compare/v0.1.0...v0.2.0) (2026-05-14)


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

# Changelog

All notable changes to this project will be documented in this file. The format
is generated automatically by [semantic-release](https://semantic-release.gitbook.io/)
on each `main` and `next` release; this file is initialized as a stub anchored
at `v0.1.0` (pre-tagged manually during the semantic-release-automation rollout).

Entries below this header are written by `@semantic-release/changelog` on every
release that contains conventional-commit features, fixes, or breaking changes.
