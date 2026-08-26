# Session start takes 62 seconds because the staleness check spawns one git process per memory entry

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

Every new session in this repository waits about a minute before the first prompt is answered. `memory_session_start.mjs` is the only `SessionStart` hook wired in `.claude/settings.json`, so that wait is entirely its own.

Measured on 2026-08-26 at `7fd51c0`, on the live store of 434 entries:

| What | Measurement |
|---|---|
| `memory_session_start.mjs`, wall clock | **62.19s** |
| `buildIndex()` alone | 61,487ms |
| `gatherSync()` (the standup recap) | 216ms |
| Entries carrying a `verified-at` stamp | 433 |
| Distinct stamps among those 433 | **74** |
| 50 sequential `git diff --name-only <stamp>..HEAD` calls | 8,134ms (~163ms each) |
| The same call, once per distinct stamp (74) | 11,641ms |

The cause is in `.claude/hooks/lib/memory_session_start.mjs`. `isStale()` (line 216) calls `changedSince(root, stamp)` (line 168) for every entry it evaluates, and `changedSince` spawns `git diff --name-only <stamp>..HEAD` each time. With 433 stamped entries at ~163ms per spawn, the arithmetic lands on the measured minute.

Nothing about the answer varies per entry. `git diff A..HEAD` is a pure function of `(A, HEAD)`, and the 433 calls carry only 74 distinct values of `A`. Most of that minute recomputes an answer the same process already has.

The cost also scales with the store. The predicate is per-entry, so every entry a future `/memory-sync` promotes adds another ~163ms to every session start from then on.

## Goal

A new session in this repository starts without a perceptible wait, and the set of entries reported stale is exactly the set reported today.

## Non-goals

- **Changing what "stale" means.** `isStaleFromFields` in `.claude/hooks/lib/staleness.mjs` is the predicate and it stays as written. This work changes only how many times its `changedPaths` input is computed. A faster hook that reports a different stale set is a failure, not a trade.
- **Re-verifying or reducing the 25 currently-stale entries.** That is memory curation and belongs to `/memory-sync`, not here.
- **Restructuring the hook's output.** The index, the concept map, the resume snapshot and the standup recap all render exactly as they do now.
- **Making `buildIndex` asynchronous.** Parallelising the git calls would also cut the time, and it is out of scope here: the callers are synchronous and changing that reaches well past this hook.
- **Adding a runtime dependency.** The `zero-runtime-dependencies` constraint holds.

## Success metrics

- Cold start (HEAD moved since the last run, live 434-entry store) — baseline: 62.19s, target: **under 5s**, measured via `/usr/bin/time -p node .claude/hooks/memory_session_start.mjs`.
- Warm start (HEAD unmoved since the last run) — baseline: 62.19s, target: **under 1s**, measured the same way.
- Git process spawns per run, cold — baseline: 433, target: **at most 74**, measured by counting `spawnSync` calls under instrumentation.
- Git process spawns per run, warm — baseline: 433, target: **1** (the `rev-parse` for HEAD), measured the same way.
- Stale set reported — baseline: 25 entries at `7fd51c0`, target: **identical membership**, measured by comparing the reported keys before and after.

## Stakeholders

- **Requester**: Tushar Srivastava — reported the slowdown and asked for the cached route plus memoization.
- **Reviewer**: Tushar Srivastava — approves at gate A and gate C.
- **Operator**: every consumer install. This hook ships in the baseline template and runs on every session in every project that installs it, so a wrong answer here is wrong everywhere and silent.

## Constraints

- **Additive only.** The `shipped-hook-changes-must-be-additive` rule applies: this hook is installed in consumer projects, and narrowing what it reports breaks them silently. Widening or preserving is fine; narrowing is not.
- **Fail-open, always.** `changedSince` already returns `null` — meaning "could not answer" — rather than an empty array, and the predicate treats `null` as unknown and falls through to the date leg. Every new failure mode (unreadable cache, corrupt JSON, a git call that errors) must land on that same `null`, never on a silent "nothing changed".
- **No new runtime dependency** (`constraints/zero-runtime-dependencies`).
- **The cache is disposable.** `.claude/state/` is gitignored. Anything written there must be reconstructible from scratch, and a missing cache must cost only time.
- **Two callers share the predicate.** `sweep.mjs` and this hook both ask `staleness.mjs` the same question, and `tests/sweep-staleness-parity.test.mjs` pins their answers equal entry-by-entry. That test must still pass.

## Acceptance criteria

1. Given a store whose N stamped entries carry M distinct `verified-at` values, when `buildIndex` runs, then the changed-set is computed at most M times rather than N.
2. Given a run whose HEAD equals the HEAD recorded in the cache, when `buildIndex` runs, then it computes no changed-set from git and reports the same stale set as an uncached run over the same store.
3. Given a cache whose recorded HEAD differs from the current HEAD, when `buildIndex` runs, then it ignores the cached changed-sets and its stale set is identical, entry for entry, to an uncached run.
4. Given a cache file that is absent, empty, truncated, or not valid JSON, when `buildIndex` runs, then it recomputes without throwing and reports the same stale set as an uncached run.
5. Given any store, when the stale set is computed with the cache enabled and with it bypassed, then the two sets have identical membership.
6. Given an entry whose `governs:` globs match nothing in the cheap superset derived from `git log --name-only`, when the predicate evaluates it, then it is reported fresh without an exact `git diff`, and that verdict equals the verdict the exact diff would have produced.
7. Given a `verified-at` stamp that `usableStamp` rejects, when the predicate evaluates the entry, then no git argv is constructed from that stamp and the entry falls through to the date leg, as it does today.
8. Given the live store on this repository, when `.claude/hooks/memory_session_start.mjs` runs after a commit, then the stale count and the stale keys it prints match those printed by the pre-change hook at the same HEAD.

## Open questions

- **AC-006 needs a proof before it is built.** `git diff A..HEAD` lists files whose content differs between two trees. The union of per-commit file lists from `git log --name-only A..HEAD` includes files changed and then reverted, so it is a superset rather than an equal set. A superset is safe in one direction only: an entry the superset clears is provably clear under the exact diff, but an entry the superset flags may still be clear. The spec must state that argument explicitly and confine the prefilter to the clearing direction, or drop AC-006 and keep only the memoization and the cache.
- **What the cache is keyed on.** Caching the changed-set per `(stamp, HEAD)` needs no invalidation when memory files change, because the changed-set does not depend on them. Caching the finished stale verdict would. The spec should commit to caching the changed-set only, and say so.
- **Whether `sweep.mjs` gets the same treatment.** It keeps its own git call and its own parsing, by design, and it runs interactively rather than on every session. Leaving it slow is defensible; the spec should say which way it goes so the parity test's cost is understood.
