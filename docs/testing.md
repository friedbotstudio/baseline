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
`obj/template` without isolation or a `PUBLISH_TESTS` gate. The scan strips
comments first, so a test that only mentions `npm pack` in a comment is not
mistaken for a writer.

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

### The build lock is keyed per target

`scripts/build-template.sh` guards concurrent builds with a mkdir-based mutex, so
that `npm pack`'s `prepack` and any other build-triggering subprocess never race
on rebuilding the live `obj/template`. The lock dir is derived from the build
target by `scripts/build-lock-dir.mjs` (a sha256 of the target path under
`${TMPDIR}`), not from one fixed path.

Keying the lock on the target is what lets the isolated builds run at the same
time. Two builds aimed at different targets, like the per-test tmp clones from
`cloneAndBuild`, take independent locks and proceed in parallel. Two builds aimed
at the same target, such as `prepack` plus a live-tree build, still share one
lock and serialize, so the `obj/template` race stays closed. The difference is
measurable: three concurrent isolated builds finish in about 2s when the lock is
keyed per target, versus about 8s under a single global lock.

### The per-test clone stays small and copy-on-write

Once the build lock no longer serialized builds, the wall-clock floor turned out
to be the clone itself, not any single test. `cloneAndBuild` (and the few tests
that still inline their own `rsync`) copy the working tree into a temp dir, and
that tree carried Claude Code's own `.config/` state — memory, transcripts, and
file-history that can reach a few hundred megabytes on a dev machine. It is
gitignored and irrelevant to any build or audit, so every clone excludes it
alongside `node_modules`, `obj`, and `.git`. The exclude is a no-op in CI and on
a fresh checkout (where `.config/` lives under `$HOME`, not in the repo), so it
only ever helps.

`skill-ownership.test.mjs` builds one pristine tree and hands each test its own
writable copy. Those copies are made copy-on-write where the platform supports it
— APFS clonefile (`cp -c`) on macOS, reflink (`cp --reflink=auto`) on Linux —
falling back to a plain archive copy elsewhere. Because each test mutates only its
own copy, the shared blocks diverge correctly on first write.

Together these took the default suite from a few minutes to well under a minute on
a quiesced machine. Single-shot timings are noise-dominated, so profile per-test
`duration_ms` and run the suite a few times for a median before claiming a speed
win; don't chase total wall-clock from one run.
