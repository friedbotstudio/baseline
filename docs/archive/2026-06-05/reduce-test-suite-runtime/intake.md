# Reduce the full test suite runtime from ~459s toward ~1 minute

<!--
Intake document. Produced by the `intake` skill.
Primary input: docs/brief/reduce-test-suite-runtime.md (brainstorm Step 0.5).
Picks up backlog item reduce-full-test-suite-runtime-toward-one-minute-652c.
-->

## Problem

**Re-baselined this session:** the suite now runs in **~94s** (93.85s real, green), already in parallel — *not* the ~459s the backlog recorded. The backlog premise ("pinned to `--test-concurrency=1`, ~459s") is stale: there is no concurrency pin at HEAD, and the tmpdir-isolation work has already landed. The remaining opportunity is shaving a ~94s parallel suite toward ~60s, not parallelizing a 459s serial one. (Backlog history, for context: ~644s → ~459s after Part A @ 2afb07c, 2026-06-02.) 139 test files, all green.

The pain lands on the developer in the inner change → run → result loop: every time you change a hook, skill, or template and want to know whether you broke an invariant, you wait minutes. The suite is effectively the *local* correctness gate — the release CI workflow (`.github/workflows/release.yml`) runs `publish:check`, `semantic-release`, and `build:site`, but does **not** run the `node --test` suite — so the seven-minute wait is paid by humans iterating locally, not by CI.

A large share of the time comes from a handful of tests that each run a full template build (`scripts/build-template.sh`: rsync + sha256 of ~260 files + audit, ~20-30s each), and from the suite being unable to overlap that work. The backlog entry records that the suite was (at least at one point) pinned to serial execution because some build-exercising tests mutate the live `obj/template` tree while others read it — a data race under concurrency.

## Goal

The developer can run the full suite fast enough to stay in the local change-test-iterate loop, without giving up any test or weakening any assertion.

## Non-goals

- **No coverage loss.** Every test that runs today still runs after this work. Speed is never bought by deleting or skipping tests to hit a number.
- **No verdict-fidelity loss.** A green run means exactly what it means today — no assertion is weakened or removed to go faster.
- **No CI/local divergence.** Any env-gated tier must not become a path that silently skips checks the project relies on; whatever set gates correctness must run the same way wherever it runs. (An opt-in *additional* tier for rarely-changing, network/npm-dependent tests is acceptable as long as the gate is explicit and documented.)
- **Not a test-runner migration.** Stay within `node:test` + existing tooling; this work does not introduce a new test framework.
- **Not a rewrite of the build.** `scripts/build-template.sh` and the manifest builder may be made faster or called fewer times, but redesigning the build system is out of scope.

## Success metrics

- Full-suite wall-clock — baseline: **~94s** (measured this session at HEAD; the ~459s in the backlog is stale), target: ≤ ~60s or as low as practical with diminishing returns as the stop signal, measured via: `time node --test tests/*.test.mjs` on the same machine.
- Test count run — baseline: 139 files, target: 139 files (unchanged — coverage non-goal), measured via: test reporter file count.
- Pass/fail verdict — baseline: green, target: green with identical assertion set, measured via: full suite exit 0 + `audit-baseline` PASS.

## Stakeholders

- **Requester**: Tushar Srivastava (repo owner; raised the backlog item 2026-06-02).
- **Reviewer**: Tushar Srivastava (approves the spec at gate A).
- **Operator**: the developer running the suite locally during iteration (same person, in the dev loop).

## Constraints

- Must run on the existing stack: Node `node:test`, `bash scripts/build-template.sh`, the audit (`audit.mjs`). No new test framework or external service.
- The live `obj/template` tree is shared mutable state: `tests/build-template.test.mjs` rm -rf's and rebuilds it; other tests read it. Any parallelization must remove this shared-state hazard first (documented as landmine `live-objtemplate-rebuild-races-parallel-test-readers`). This is the load-bearing safety constraint.
- The verdict source for the workflow's own `verify`/`integrate` stamps is `audit-baseline`; this work must not change what that verdict means.
- The 6 JVM-spawning PlantUML tests are already gated behind `PLANTUML_TESTS=1` (Part A); the suite under measurement is the default (no PlantUML) run.

## Acceptance criteria

1. Given the full suite is run with default settings, when it completes, then every one of the 139 test files that runs today still runs (no test deleted, skipped, or moved behind an always-off gate) and the suite exits 0.
2. Given two or more build/manifest/audit tests run concurrently, when they execute, then none mutates a tree another reads — i.e. no test writes to the live `obj/template` (each build-exercising test operates on an isolated tmpdir), so the suite is safe to run without the serial concurrency pin.
3. Given the suite is run before and after this change on the same machine, when wall-clock is measured, then the after-time is materially lower than the ~459s baseline and trends toward ~60s (exact target is directional, not a hard gate).
4. Given any test that is moved behind an env-gate (e.g. npm-pack/install tests), when the gate is off, then the gating is explicit, documented, and the gated tests remain runnable on demand; when the gate is on, they pass.
5. Given the template build is invoked by multiple tests, when the suite runs, then the build is performed the minimum number of times needed for correctness (shared read-only fixture for read-only tests; isolated copies only for tests that mutate), not once per test file.

## Open questions

- **Resolved:** live baseline at HEAD is ~94s (parallel, green) — the ~459s figure was stale. Open follow-up for `/research`: with the suite already parallel and isolated, is the ~94s→~60s gain worth the change cost, and which of levers 2–4 actually move the needle? (Per-file timing, not the stale Part-A serial offender list, should drive this.)
