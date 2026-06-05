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

## reduce-test-suite-non-build-tentpoles-after-per-target-lock-3faf

> verbatim (assistant, 2026-06-05, during build-mutex-per-target):
> Per-target build lock landed: 3 concurrent isolated builds run in ~2s vs ~8s under the old global lock. The build-serialization bottleneck is gone, but the full suite is still well over a minute — non-build tent-poles now dominate the wall-clock, so the "~1 minute" goal is not met by the lock change alone.

- source: assistant-deferral
- status: open
- raised-on: 2026-06-05
- raised-in-context: build-mutex-per-target workflow. This is the SUCCESSOR to `...global-build-mutex-7b1e`, which closed as picked-up: its direction (1) "make the build mutex per-PKG_ROOT" shipped as `scripts/build-lock-dir.mjs`. The residual SPEED goal (`reduce-full-test-suite-runtime-toward-one-minute`, the original 652c parent) is what remains.
- estimated-effort: medium
- verified-at: 2e5d3c2
- last-touched: 2026-06-05
- caveat: With build-serialization removed, the wall-clock floor is now set by individual slow tests, NOT the build lock. Single-shot full-suite timing on a loaded dev machine is noise-dominated (observed 154s / 274s / 285s across runs), so DON'T chase suite wall-clock directly — profile per-test and attack tent-poles. **Top suspect: `tests/skill-ownership.test.mjs` "build manifest v2" (~131s in one run)** — it is the test that builds TWICE (byte-identical-rebuild determinism assertion). Consider asserting determinism more cheaply (hash two manifest builds without two full template builds, or reuse one build + re-stamp). Other build-exercising files (~7-10) each run one ~2s build; with per-target locking they now parallelize up to CPU count, so they're no longer the bottleneck. The build-free shared-fixture idea (7b1e direction 2) is now LOWER priority since per-target locking already gives parallel builds — revisit only if profiling shows build cost still dominates. Measurement discipline: run the suite 3-5x on a quiesced machine (or measure in CI where the runner is consistent) and take the median before claiming any speed win; prefer per-test `duration_ms` from the spec reporter over total wall-clock. Cross-ref: landmark `scripts/build-lock-dir.mjs:1`; landmine `live-objtemplate-rebuild-races-parallel-test-readers`.
