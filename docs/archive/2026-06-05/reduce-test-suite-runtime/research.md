# Pattern Research — reduce-test-suite-runtime

> **Re-baselined premise.** The suite is *not* serial-pinned at HEAD; `node --test tests/*.test.mjs` runs in parallel (default `--test-concurrency = os.availableParallelism()-1`) at **~94s, green**. The work is no longer "parallelize a 459s serial suite." It is two separable problems: **(1) speed** — shave the ~94s parallel wall-clock; **(2) determinism** — the landmine `live-objtemplate-rebuild-races-parallel-test-readers` (re-confirmed 2026-06-03 @ 698fd1a) records intermittent parallel-only failures, which is why the *trusted verdict* path is the slow serial `--test-concurrency=1`. The prize is a fast path that is *also* deterministic, so it can replace the slow verdict path. **Flakiness re-measurement is in and it is decisive: 2 of 3 parallel runs FAILED at HEAD** (run1 green; run2 `test_npm_pack_excludes_site` FAIL; run3 `scan-shipped-skills — clean tree on the real repo` FAIL) — different tests each time, the signature intermittent live-tree race. Determinism is broken now, not hypothetically. This makes **Candidate D a prerequisite, not optional**, and it reframes the whole effort: the prize is determinism first, speed second (a red-2/3 fast suite is worthless as a verdict).

## Measured facts (this session, HEAD)

- Full parallel suite: **93.85s real** (user 214.94 + sys 174.77 → heavily parallel + I/O-bound on rsync/sha256), exit 0.
- **Per-file wall-clock floor** (each file run alone, incl. its own build), top of distribution:
  - `publish-check` **45.7s**, `skill-ownership` **39.3s**, `workflows-install-upgrade` 8.7s, `build-audit-gate` 7.0s, `manifest` 6.5s, `memory-flush-phase` 6.3s, `audit-baseline-post-amendment` 6.0s, `upgrade-project` 5.5s, rest < 4s.
- Interpretation: under perfect parallelism the floor ≈ the slowest single file ≈ **46s** (`publish-check`). The ~94s measured = floor + contention: ~17 files each run `scripts/build-template.sh`, serializing on its global `mkdir` build-mutex and saturating CPU/IO. Two tent-poles (`publish-check`, `skill-ownership`) dominate; collapsing per-file builds closes the 94→46 gap; cutting the tent-poles lowers the floor itself.

## API references (current)

Node **v25.8.1** (lockfile/runtime), `node:test`. Verified via context7 `/nodejs/node/v25.9.0`:

- `--test-concurrency` — "controls the maximum number of test files the runner executes concurrently. If isolation is 'none', ignored (concurrency one). Otherwise defaults to `os.availableParallelism() - 1`." → confirms the suite already parallelizes; no pin present.
- `--test-global-setup <module>` — "a module evaluated **before all tests are executed**, used to set up global state or fixtures." Module exports async `globalSetup`/`globalTeardown`; "if `globalSetup` throws, no tests run, process exits non-zero, `globalTeardown` is not called." Source: `doc/api/test.md` / `doc/api/cli.md` v25.9.0.
- `--test-isolation` — default `'process'`: "each test file runs in a separate child process" (this is why the in-process `_builtPromise` memo in `manifest.test.mjs` cannot share a build across files). `run()`'s `env` option can pass env to child processes but "is not compatible with isolation='none'" and propagation semantics under the CLI are unstated — so a **known fixture path** is the robust cross-process sharing channel, not env vars.

## Candidate A: Env-gate the npm/network tent-poles

- **Summary**: Put the heaviest, rarely-changing, network/npm-dependent tests behind an opt-in env flag, exactly as the 6 JVM PlantUML tests already sit behind `PLANTUML_TESTS=1`. Primary target: `publish-check` (45.7s — half the floor); also `npm-pack-tarball`, `smoke-tarball`, `check-files-diff`, `release-workflow`, `site-relative-paths`, `ga4-built-site`.
- **API references (current)**: none — pure env-gate pattern; the precedent is `PLANTUML_TESTS=1` in-repo.
- **Fits**: Yes — mirrors an established in-repo idiom (Scout "Patterns in use"). CI parity preserved: `.github/workflows/release.yml` runs `npm run publish:check` independently, so gating these *locally* does not remove them from the path that actually gates publishing (intake non-goal #3).
- **Tests it enables**: unchanged set; the gate is a runtime selector, and CI sets the flag (or runs publish:check directly) so coverage is identical where it matters.
- **Tradeoffs**: Biggest single wall-clock win (removes the 46s tent-pole → floor drops toward ~10s) at the lowest risk — **AND it is also a determinism fix**: `npm pack` (run by `publish-check`/`npm-pack-tarball` via `prepack` → `build-template.sh`) is a live-`obj/template` *writer*; the run-2/run-3 flake failures are readers racing exactly this writer. Gating these tests out of the default parallel run removes the writer, so the readers stop racing. This is a twofer — speed + determinism from one change. Cost: a local default run no longer exercises packaging unless the dev opts in — must be loudly documented so "green locally" isn't misread as "publishable." This is the lever the brief's CI-parity non-goal was written to constrain; gate must be explicit, not silent.

## Candidate B: Build the template once via `--test-global-setup`

- **Summary**: A setup module builds the template **once** into a deterministic fixture path (e.g. `obj/test-shared-template/`), exported through a shared test helper constant; the ~13 read-only build-consuming tests read that prebuilt tree instead of each running `build-template.sh`; the ~4 mutating tests `cp -a` from it (cheap) instead of full rsync+build. `globalTeardown` removes it.
- **API references (current)**: `--test-global-setup` (context7 v25.9.0, above) — runs once before all files; throw-aborts the run.
- **Fits**: Partially — extends the existing `cloneAndBuild` idiom (Scout) but introduces a new mechanism (global setup) not currently wired. Cross-process sharing via a known path sidesteps the unverified env-propagation question.
- **Tests it enables**: same tests, far less redundant build work; collapses ~17 builds → 1 + cheap clones, closing the 94→46 contention gap.
- **Tradeoffs**: Largest structural speedup on the contention component, but the most engineering and the most interplay with determinism: the shared fixture is itself shared state, so its lifecycle (build-before-any-test, never-mutated-by-readers, torn-down-after) must be airtight or it reintroduces the very race we're trying to kill. Reversibility: medium — touches `package.json` test invocation + every build-consuming test's source path.

## Candidate C: Drop the redundant Stage-4 re-hash in `build-template.sh`

- **Summary**: After a fresh build, `scripts/build-manifest.mjs` has just sha256'd ~260 files to stamp the manifest; the Stage-4 audit (`audit.mjs`) immediately re-hashes the same files. Add a post-fresh-build fast path (`--skip-hash-check`, or skip Stage-4 hashing when the manifest was just written this invocation) so each build hashes once, not twice.
- **API references (current)**: none — internal scripts (`build-template.sh`, `build-manifest.mjs`, `audit.mjs`).
- **Fits**: Yes — internal optimization, no new dependency. Helps the `skill-ownership` tent-pole (39s, build-dominated) and every builder, plus real `npm run build`/`prepack`.
- **Tests it enables**: unchanged; must preserve audit verdict fidelity (intake non-goal) — the skip applies only to the redundant *re-hash of just-written files*, never to drift detection on a pre-existing tree.
- **Tradeoffs**: Small, cheap, composes with A and B. Risk: getting the "freshly built this invocation" condition wrong could skip a real drift check — needs a tight, explicit guard and a test that the audit still FAILs on a tampered tree.

## Candidate D: Isolate the live-`obj/template` audit readers (determinism)

- **Summary**: ~5 tests run `audit.mjs` against the live repo root with no isolation (`audit-skill-count-drift`, `derive-counts`, `template-drift`, `thread-shelving-governance`, `whatsnew-counts`); `audit.mjs:loadManifest()` falls back to reading live `obj/template/.claude/manifest.json`. Per the landmine these are the parallel-flake victims. Fix per landmine mitigation #2: assert the **source of truth** (skill frontmatter `owner: baseline` + dir presence, counts from `derive-counts.mjs` over source) instead of the built manifest, OR read an isolated build.
- **API references (current)**: none — internal.
- **Fits**: Yes — landmine mitigation #2 is the prescribed pattern.
- **Tests it enables**: makes the fast parallel run *deterministic*, so it can serve as the `/integrate` verdict (today that requires the slow serial run).
- **Tradeoffs**: Orthogonal to raw speed but it is what converts "fast" into "fast AND trustworthy." **Now confirmed required** — 2/3 parallel runs failed. The empirical failures point at two writer/reader pairs: (i) `npm pack`/`prepack` rebuilding live `obj/template` vs packaging readers (largely neutralized by Candidate A's gate), and (ii) `scan-shipped-skills`/other audit readers of the live tree. After A removes the npm-pack writer, re-measure; isolate or source-of-truth-assert any residual racing reader (landmine mitigation #2). The end state: a parallel run that is green N× consecutively, qualifying it as the `/integrate` verdict.

## Recommendation

The flakiness result reorders everything: **determinism is the goal, speed is the welcome side effect.** Recommended scope, determinism-first:

1. **Candidate A — env-gate the npm-pack/publish/network tests** (the twofer). Removes the live-tree *writer* (`npm pack`→`prepack`→`build-template.sh`) that the run-2/run-3 flakes raced, **and** removes the 46s speed tent-pole. One change buys most of both objectives: a default run that is faster (floor → ~10s region) and missing the dominant race source. CI keeps running these via `publish:check` (parity preserved).
2. **Candidate D — close the residual race.** After A, re-measure N× parallel; for any reader still racing the live tree (`scan-shipped-skills` and the ~5 tmp=0 audit readers), apply landmine mitigation #2 (assert source-of-truth / read an isolated build). Acceptance bar: parallel run green ≥ 5× consecutively, qualifying it as the `/integrate` verdict.
3. **Candidate C — drop the redundant Stage-4 re-hash.** Cheap; lowers the `skill-ownership` tent-pole (39s) and every build, incl. real packaging. Pure speed, composes cleanly.
4. **Candidate B — build-once via `--test-global-setup`** only if, after 1–3, build-contention still keeps wall-clock materially above target. Biggest structural speedup but most effort and most shared-state risk; likely YAGNI if A+C already land under 60s.

**Minimum viable scope = A + D** (deterministic fast suite). C is a cheap add. B is the stretch. This honors the brief's "push as far as practical, stop at diminishing returns."

**What flips the decision**: (a) if A alone makes parallel green N× (writer fully removed), D shrinks to a landmine re-verify + the N×-green AC; (b) if a residual writer survives A (e.g. another test rebuilding live `obj/template`), D grows and must find it first; (c) if any gated test guards a check CI does *not* otherwise run, A narrows to the truly-redundant subset and the rest carry more load.

## Open questions

1. **Determinism verdict — RESOLVED:** parallel `npm test` is intermittently flaky at HEAD (2/3 runs failed, different tests, live-tree race). D is a prerequisite. Remaining sub-question for `/spec`: after A removes the npm-pack writer, is there any *other* live-`obj/template` writer, or are the residual flakes purely reader-vs-npm-pack? (Determines D's size.)
2. **Scope ceiling (load-bearing call for gate A):** commit to **A + D** (deterministic fast suite, the minimum that satisfies the real intent), or also fold in **C** (cheap speed) and/or **B** (build-once, the stretch)? Recommend A + D + C; hold B unless measurement demands it.
3. **Verdict-path policy:** once the parallel path is deterministic (green N×), should `/integrate` + the landmine's "run serially for a deterministic verdict" guidance switch to endorsing the fast parallel run, and should the serial `--test-concurrency=1` command be retired or kept as a fallback? (Touches `project.json → test.cmd` and the landmine entry, which must be re-verified/updated either way.)
