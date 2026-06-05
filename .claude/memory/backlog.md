---
owners: [/memory-flush]
category: future-work intent
size-cap: 500
key: <slug>-<4char-hash>
verifies-against: none
stale-exempt: true
---

# Backlog

Future-work intent captured automatically by `memory_stop.mjs`. Curated into this file via `/memory-flush`. Stable key shape: `<8-word-kebab>-<4-char-sha256>`. Entries use `superseded-at:` as the closure trigger (auto-delete on the next `/memory-flush` Step 0a sweep); the body `status:` field disambiguates whether the entry was `picked-up` (taken into a workflow) or `dropped` (decided not to do). Entries are decay-exempt: they do not stale-age regardless of `verified-at:` distance (see the stale-exempt carve-out in `memory_session_start.mjs` and `sweep.mjs`).

---

## baseline-v1-thought-compiler-agent-team-plan-mode-9d4c

> verbatim (user, 2026-06-01):
> We need to amend the constitution first to allow Agent team system with multiple parallel agents working of parts like check and balance ... The main thread is the orchestrator and other threads are background worker agents ... the spec after approval must trigger plan mode for orchestration ... The plan is executed by one or multiple maker nodes, and one or more checker nodes are used to review and critique the solution in a RALPH loop ... Once we build this level of machinary we will label it baseline v1 (a thought compiler).

- source: user-instruction
- status: open
- raised-on: 2026-06-01
- raised-in-context: vision conversation (branched /btw session) during the changelog-classify-from-entries workflow
- estimated-effort: large
- verified-at: HEAD
- last-touched: 2026-06-01
- caveat: Full vision + audit captured at `docs/vision/baseline-v1-thought-compiler.md` (currently UNTRACKED — not in any commit yet; a future v1-design workflow should commit it). This is the big next epoch, NOT a quickfix. Sequence per the doc: (1) amend seed.md §Article II then CLAUDE.md to permit bounded agent-team execution under an orchestrator (workers decide inside an orchestrator-owned frame; scope/write_set escalation bounces up); (2) plan-as-durable-diffable-state schema (mirror workflow.json discipline); (3) maker/checker RALPH protocol with checkers BOUND TO MECHANICAL ORACLES (the load-bearing constraint — two LLMs alone agree on hallucinations); (4) the "safe vs ask-a-human" gate taxonomy BEFORE any autonomy; (5) AI-native debugging skill (explanation-trace as the reviewable object). Each of 1–5 deserves its own intake→spec→approve cycle. v2 (signal-driven AI-native OS: Sentry/GA4/CRM/CI connectors → diagnose → fix → deploy) rides on a trusted v1. Open questions (maker/checker deadlock cap, where reactivity lives, the merge/synthesis oracle, auto-deploy rollback + kill switch) are listed in the doc.

---

## reduce-full-test-suite-runtime-toward-one-minute-652c

> verbatim (user, 2026-06-02):
> let us add a backlog item to reduce this testing time to ~1 minutes (or whatever least is possible)

- source: user-instruction
- status: open
- raised-on: 2026-06-02
- raised-in-context: right after Part A (`faster-test-suite-shared-build-plantuml-gate`, commit 2afb07c) cut the serial suite ~644s→~459s; the user wants a deeper target (~1 min) and Part B (plantuml-guard-opt-in-strict) was in flight
- estimated-effort: medium-large
- verified-at: 2afb07c
- last-touched: 2026-06-02
- caveat: Part A already (a) gated the 6 JVM-spawning PlantUML tests behind `PLANTUML_TESTS=1` and (b) shared the per-test template build inside `skill-ownership.test.mjs` / `manifest.test.mjs`. To go from ~459s toward ~60s the dominant levers, in priority order: **(1) Run the suite in PARALLEL.** It is pinned to `--test-concurrency=1` because some build-exercising tests mutate the LIVE `obj/template` (`tests/build-template.test.mjs` rm -rf's + rebuilds it; others READ it) — a data race under concurrency. Route EVERY build/manifest/audit test through an isolated tmpdir (the `tests/helpers/clone-and-build.mjs` pattern) so NOTHING touches live `obj/template`, then drop the concurrency pin. Wall-clock then approaches max-single-test (~15-30s) instead of sum-of-all. This is the single biggest win. **(2) Build the template ONCE per suite, not per file.** ~10 test cases each run a full `scripts/build-template.sh` (rsync + sha256 of ~260 files + audit, ~20-30s each). node:test isolates files in separate processes, so a process-level cache won't cross files — instead build one pristine tree in a global setup (or a make-style prebuilt fixture under a known tmp path) and have all read-only build/manifest tests point at it; mutating drift tests `cp -a` from it (Part A already does this within a file). **(3) Speed up the build itself:** `scripts/build-manifest.mjs:138-150` reads+sha256s ~260 files per build (~8-12s); `build-template.sh` Stage 4 then re-hashes them again in `audit.mjs:295` — skip the redundant Stage-4 re-hash after a fresh build (the DEFERRED "audit `--skip-hash-check`" idea, ~16-24s total across tests). **(4)** Env-gate or trim the npm-pack/install `publish-check`/`smoke-tarball` tests (~1.5 min) behind a flag like the PlantUML gate, since they need network/npm and rarely change. Measured baseline + per-test breakdown captured during the Part A investigation (top offenders: spec-lint check_design_calls 59s [now gated], build-audit-gate 35s, manifest-tier 28s, audit-exits-0 27s, manifest-v2 25s, skill-ownership drift cluster). Net: parallelization (1) + single-build (2) should plausibly reach 1-2 min; (3)+(4) trim further. Risk: (1) requires auditing every test for hidden shared-state writes (live `obj/template`, `.claude/state/`, `.claude/memory/`) before lifting the concurrency pin. Cross-ref: the live-`obj/template` race is now documented as the landmine `live-objtemplate-rebuild-races-parallel-test-readers` (landmines.md).

## reduce-test-suite-wall-clock-blocked-on-global-build-mutex-7b1e

> verbatim (assistant, 2026-06-05, during reduce-test-suite-runtime):
> Candidate B (--test-global-setup build-once) regressed badly (421s for 5 files). Root cause: scripts/build-template.sh holds a machine-global mkdir mutex, so builds serialize machine-wide and the shared-clone approach can't beat the contention.

- source: assistant-deferral
- status: open
- raised-on: 2026-06-05
- raised-in-context: reduce-test-suite-runtime workflow. A+D+C shipped (determinism: parallel suite went from 2/3-red to 8/8-green; full suite ~61-120s green). But the SPEED half of the parent item `reduce-full-test-suite-runtime-toward-one-minute-652c` was NOT achieved — wall-clock stayed ~90s. Candidate B (build the template once via `--test-global-setup`, cp from a shared fixture) was attempted at the user's request and reverted.
- estimated-effort: medium-large
- verified-at: a493cdb
- last-touched: 2026-06-05
- caveat: **The blocker is `scripts/build-template.sh`'s machine-global mkdir mutex** (`$TMPDIR/create-baseline-build.lock.d`, build-template.sh:29) — it serializes EVERY build on the machine. ~7-10 build-exercising test files each run a full build (~18s); under the mutex they serialize, so the wall-clock floor is dominated by that build-contention chain (after publish-check is gated, `skill-ownership` ~39s — itself one build + one byte-identical rebuild — is the tent-pole). Build-once via `--test-global-setup` cannot help while the mutex forces machine-wide serialization AND while a cp-from-shared-clone of the full repo is itself costly. **Two viable directions for a future speed workflow, do FIRST before build-once:** (1) make the build mutex per-PKG_ROOT (lock keyed on the build target dir, not a single global path) so isolated builds genuinely parallelize; OR (2) a truly build-free shared fixture: globalSetup builds once into a known path, read-only build/manifest/audit tests consume that path directly WITHOUT copying (only mutating drift tests cp). Also reconsider whether `skill-ownership`'s byte-identical-rebuild test (the one test that MUST build twice) can assert determinism more cheaply. Measurement gate: re-confirm 5x parallel green AND wall-clock materially < 90s before claiming done. The determinism guard `tests/no-live-objtemplate-reads.test.mjs` and the `PUBLISH_TESTS`/`PLANTUML_TESTS`/`test:full` tiers from this workflow stay in place. Cross-ref: libraries.md `node:test@node-25.8.1`; landmine `live-objtemplate-rebuild-races-parallel-test-readers`.
