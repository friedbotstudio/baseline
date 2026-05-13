# Spec extension — `mode` input — 2026-05-13

This is a **breadcrumb**, not a spec. The original `release-workflow` spec was approved earlier on 2026-05-13 and the bundle in this directory (`intake.md`, `scout.md`, `research.md`, `spec.approved`, `security.md`) captures that pre-extension shape. A few minutes after the workflow was archived, the live spec at `docs/specs/release-workflow.md` gained a `mode` input + conditional job gating without going through a fresh `/triage` → `/spec` → `/approve-spec` cycle. This note records that extension so a future reader of the archive bundle isn't surprised by the YAML diverging from the artifacts here.

## What changed

The release workflow at `.github/workflows/release.yml` accepts a new `workflow_dispatch.inputs.mode` choice with two values:

| `mode` | Behavior |
|---|---|
| `release` (default) | Original four-job pipeline: `build-verify` → `publish-npm` → `{deploy-pages, push-bump, install-smoke}`. `bump_type` is read; `npm publish --provenance` runs; `vX.Y.Z` is pushed to `main`. |
| `docs-only` | `build-verify` runs but the bump step is a no-op (`if: inputs.mode == 'release'`). `publish-npm`, `push-bump`, `install-smoke` are skipped. `deploy-pages` runs (its `if:` predicate was widened to accept a skipped publish, gated on `needs.publish-npm.result` being `success` or `skipped`). The site rebuilds and deploys against the current `package.json` version without minting a new one. |

`bump_type` lost its `required: true` flag — it still defaults to `patch` but is ignored when `mode=docs-only`.

The extension touched three files:

- `.github/workflows/release.yml` — six edits (new `mode` input, gated bump step, four job-level `if:` predicates).
- `docs/specs/release-workflow.md` — three edits (Goal extension paragraph, class diagram, new AC-013 row).
- `tests/release-workflow.test.mjs` — extended the test surface from 10 to 14: one new `inputBlock()` helper, one new mode-shape test, three new AC-013 gating tests, one rewrite of the AC-001 test to scope assertions to the bump_type sub-block and assert that `required: true` is **absent**.

Full project suite went from 184/184 to 188/188; audit-baseline stayed PASS.

## Why outside the workflow

Per CLAUDE.md Article IV the formal path for a spec change is `/triage` → `/spec` → `/approve-spec` → `/tdd` → … The user picked the "re-open the archived spec" option from a question I asked, explicitly accepting "departs from archive discipline" as the tradeoff. The harness was in the `done` state, the change was small (one input + four conditionals), and the live tests turned green on the first edit pass. The constitution permits ad-hoc edits to artifacts outside an active workflow (the `track_guard` enforces phase ordering only for in-flight workflows reading `.claude/state/workflow.json`).

The cost paid for skipping the formal cycle: this breadcrumb, and the AC-013 row in the live spec was authored without a `/approve-spec` token. The spec.approved token in this bundle covers only the pre-AC-013 shape.

## AC-013 reference

The live spec at `docs/specs/release-workflow.md` carries the post-extension AC table. The new row is **AC-013**, immediately after AC-012:

> AC-013 — Given the operator submits `workflow_dispatch` with `mode=docs-only`, when the workflow runs, then (a) the bump step in build-verify is a no-op (package.json version unchanged), (b) jobs `publish-npm`, `push-bump`, and `install-smoke` are skipped via `if: inputs.mode == 'release'`, (c) `deploy-pages` runs (gated by `if: always() && (needs.publish-npm.result == 'success' \|\| needs.publish-npm.result == 'skipped')`), and (d) the rendered site reflects the current package.json version, not a new one.

Sequence references in the AC point to §Behavior #1 (mode-gating segment) and §Behavior #3 (deploy-pages run-when-skipped predicate). The pre-existing sequences in the spec already cover the new behavior at the same granularity, so no new diagrams were added.

## How to act on this drift

For future similar extensions: run `/triage` even when the change feels small. The extra cost is a handful of harness ticks, mostly degenerate (already-green tests, already-written YAML); the benefit is a coherent archive trail. The "re-open the approved spec" lever is for emergencies (broken release, urgent fix), not for incremental scope additions.
