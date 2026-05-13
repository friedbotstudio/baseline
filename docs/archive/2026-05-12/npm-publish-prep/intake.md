# Publish create-baseline to npm with a pre-flight check + runbook so first-publish risk is contained

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

`create-baseline` is at `0.1.0` in `package.json` with `bin: bin/cli.js`, `files: [bin/, src/, obj/template/, README.md]`, and a `prepack` build script — but has never been published. A first `npm publish` carries three concrete risks that no current automation catches:

1. **Stale or missing files in the tarball.** The `files:` allowlist is authored manually; nothing today verifies that what `npm pack` actually emits matches the intent (e.g., a renamed dir in `obj/template/` could ship empty; a new top-level dir the CLI depends on could be silently excluded). The published `.tgz` is the contract — if it's wrong, every `npx create-baseline` install breaks.
2. **The published artifact is untested in isolation.** Local `node bin/cli.js <tgt>` works because the repo tree is present. The published tarball is a different artifact — only `files:`-listed paths, after `prepack` ran. There is no smoke test that installs the tarball into a clean tmpdir and exercises `create-baseline <target>` against it. Today, the first `npm publish` doubles as the first end-to-end test of the shipped artifact, in front of real users.
3. **No rollback discipline.** First-time publish has no runbook covering version-bump conventions, dist-tag strategy, the 72-hour `npm unpublish` window, `npm deprecate` semantics, or what to do if the published `.tgz` is broken. A human operator unfamiliar with this repo has to invent the procedure under pressure.

The smallest concrete failure scenario: a maintainer publishes `0.1.0`, a downstream user runs `npx create-baseline ./myproj`, the CLI throws `ENOENT: obj/template/manifest.json` because `obj/template/` wasn't rebuilt before pack — and the tag is already public and immutable. Recovery is `0.1.1` with the fix, plus a deprecate note on `0.1.0`. The smoke test would have caught it before publish.

## Goal

The first `npm publish` of `create-baseline` is a non-event: a maintainer runs one verification command, reads its green output, follows a runbook, and ships — with a documented rollback path if the artifact is wrong.

## Non-goals

- **CI integration.** This workflow is non-git; there is no GitHub Actions, no PR-gated publish. The verification is operator-driven, run locally before `npm publish`. Adding CI is out of scope.
- **Automated version-bump or changelog generation.** The runbook documents version-bump conventions for a human; we are not adding `standard-version`, `changesets`, or release-please.
- **Multi-package / workspaces support.** `create-baseline` is a single package; we are not generalizing the pre-publish tooling for a future monorepo.
- **Provenance / signed publishes.** `npm publish --provenance` requires OIDC in CI; we explicitly defer this until CI exists.
- **Replacing the existing `tests/` suite.** The new smoke test lives alongside, exercising a different surface (the packed tarball) than the existing in-tree node-test suite.

## Success metrics

- **`npm run publish:check` exits 0 on the current tree** — baseline: command does not exist, target: command exists and passes, measured via: shell exit code.
- **Smoke test catches a deliberately broken tarball** — baseline: no smoke test, target: a unit-test exists that constructs a tarball with `obj/template/` removed and asserts the smoke test rejects it with a useful error, measured via: `node --test` on the negative-path test case.
- **Runbook is operator-actionable cold** — baseline: no runbook, target: a teammate with no `create-baseline` familiarity can complete a dry-run publish (`npm publish --dry-run`) by following the runbook end-to-end without asking questions, measured via: self-review pass + one named reviewer (see Stakeholders) confirming they could execute it.
- **Pre-publish verification covers all three risks** — baseline: none covered, target: each of files-diff, tarball smoke, version-bump-correctness is exercised by `publish:check`, measured via: `publish:check` source review against this intake's risk list.

## Stakeholders

- **Requester**: razieldecarte@gmail.com (project owner).
- **Reviewer**: razieldecarte@gmail.com — same person; this is a solo project. Reviewer-as-self risk acknowledged; runbook explicitly invites a future second reviewer.
- **Operator** (who runs `npm publish` in prod): razieldecarte@gmail.com initially; runbook written for any future contributor with npm publish rights.

## Constraints

- **Non-git project.** No commit/grant-commit phases (excepted per CLAUDE.md Article IV). Artifacts land on disk without version control — operator is responsible for backup/persistence.
- **Node ≥ 18.17.0** (per `package.json` engines). Verification scripts must run under that floor without transpilation.
- **Zero runtime deps in shipped package.** `create-baseline` declares no `dependencies`; only `devDependencies` (eleventy, nunjucks) which are excluded by `files:`. Verification tooling must not introduce a runtime dep.
- **`prepack` hook is load-bearing.** `bash scripts/build-template.sh` runs on `npm pack` / `npm publish`. The verification must run AFTER `prepack`, against the actual emitted tarball — running it against the source tree would not exercise `prepack`-emitted content.
- **Use existing test infra.** `node --test --test-reporter=spec tests/*.test.mjs` is the convention; new tests follow it. No jest/vitest.
- **macOS + Linux parity.** Smoke test uses `mktemp -d` and POSIX tools; no GNU-specific flags.

## Acceptance criteria

1. **Given** the current repo at `HEAD`, **when** an operator runs `npm run publish:check`, **then** the command exits 0 and prints a green summary line naming each check that passed (files-diff, tarball smoke, version-bump shape).
2. **Given** the current repo at `HEAD`, **when** an operator runs `npm pack` and inspects the emitted `.tgz`, **then** every path declared in `package.json → files:` is present and non-empty inside the tarball.
3. **Given** the smoke test, **when** it is run against a tarball where `obj/template/manifest.json` has been removed before packing (negative-path fixture), **then** the smoke test exits non-zero and the error message names the missing baseline-required file (not a generic `ENOENT`).
4. **Given** the runbook at `docs/runbooks/npm-publish.md`, **when** a teammate with `npm publish` rights but no prior `create-baseline` familiarity reads it cold, **then** they can execute a dry-run publish without asking questions — verified by a single step-through self-review (or a designated reviewer if available).
5. **Given** a published version that is later found broken, **when** the operator consults the runbook's rollback section, **then** they find: the 72-hour `npm unpublish` policy, the recommended `npm deprecate` message template, the version-bump strategy for the fix release, and the order of operations (deprecate broken → publish fix → verify install resolves to fix).
6. **Given** the smoke test, **when** it runs in a clean tmpdir from `mktemp -d`, **then** it installs the tarball, invokes `npx create-baseline ./target` against a fresh empty dir, and asserts the materialized baseline contains the expected hook count, skill count, and `.claude/.baseline-manifest.json` matches `obj/template/manifest.json`'s hashes.
7. **Given** the `files:` allowlist in `package.json`, **when** the files-diff check runs, **then** it reports any path declared in `files:` that is absent in the `npm pack --json` output, and any path in the `npm pack --json` output that is not covered by `files:` (a "shipped but not declared" surprise).
8. **Given** the verification scripts are invoked via `npm run publish:check`, **when** any sub-check fails, **then** the wrapping script exits non-zero with the failing check's stderr surfaced and a one-line "FAIL: <check name>" summary so an operator can triage without re-running each check individually.

## Open questions

- None — the request is concrete and self-contained. Solo project with single stakeholder means there are no cross-team alignment unknowns. Open questions are deferred to the `/research` phase, where API-shape decisions (e.g., does the smoke test use `npm pack --json` or parse `npm pack` stderr; does the files-diff use `tar -tzf` or `npm pack --dry-run --json`) get evaluated against current npm CLI docs via context7.
