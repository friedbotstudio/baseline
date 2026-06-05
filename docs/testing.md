# Testing

The suite runs with `node:test` and parallelizes across CPU cores by default.

```bash
npm test          # default tier — fast, deterministic, what you run while iterating
npm run test:full # every tier — what CI-equivalent coverage looks like locally
```

## Test tiers

Tests are split into a fast default tier and two opt-in tiers gated by environment
variables. The gates keep the inner change-test loop quick and deterministic
without dropping any coverage: the gated tests still run, just on demand and in CI.

| Tier | How to run | What it holds |
|---|---|---|
| Default | `npm test` | Everything except the two gated tiers below. |
| Publish | `PUBLISH_TESTS=1 npm test` | The heavy `npm pack` / tarball-install / publish-check flows. These rebuild the package and install it into a temp dir, so they are slow and need a working npm/tar toolchain. |
| PlantUML | `PLANTUML_TESTS=1 npm test` | The JVM-spawning PlantUML syntax tests. |

`npm run test:full` sets both gate variables.

### Why the publish tier is gated

A bare `npm pack` runs the `prepack` lifecycle, which rebuilds `obj/template`
via `scripts/build-template.sh`. When several test files do that concurrently,
one file's rebuild races another file's read of the same `obj/template`, which
showed up as intermittent failures under the default parallel run. Gating the
`npm pack` / install tests out of the default tier removes that writer, so the
default run is reliable. The always-on packaging smoke
(`tests/packaging-smoke-isolated.test.mjs`) keeps a continuous file-list check by
running `npm pack --dry-run --ignore-scripts`, which skips `prepack` entirely and
therefore never rebuilds the live tree.

The invariant is enforced by `tests/no-live-objtemplate-reads.test.mjs`: it fails
if any default-tier test executes a build or `npm pack` against the live
`obj/template` without isolation or a `PUBLISH_TESTS` gate.

### CI parity

CI does not run `npm test`. The release workflow runs `npm run publish:check`
(precheck, files-diff, smoke-tarball) independently, so the publish-tier checks
still gate releases even though they are off by default locally. A green
`npm test` means the default tier passed; it does not assert packaging — run
`npm run test:full` or `npm run publish:check` for that.

## Tests that need a built template

Tests that read the shipped `obj/template` tree build their own isolated copy in
a temp dir via `tests/helpers/clone-and-build.mjs` (`cloneAndBuild`), rather than
reading the live `obj/template` that real builds rebuild. Follow that pattern for
any new test that needs the built tree.
