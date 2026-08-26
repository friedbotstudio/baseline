---
key: .claude/hooks/lib/memory_changed_set.mjs
category: landmarks
scope: [tdd, integrate]
governs: .claude/hooks/lib/memory_changed_set.mjs, .claude/hooks/lib/memory_session_start.mjs, .claude/skills/memory-sync/sweep.mjs
source: inferred-from-code
verified-at: 5f52ba2
last-touched: 2026-08-27
---

- Role: Foundation. The changed-set behind the staleness witness — the `git diff --name-only <stamp>..HEAD` call, memoized per stamp within a run and cached on disk across runs. Landed by `session-start-stale-cache` (2026-08-26).
- Exports `createResolver` and `asResolver`. `createResolver` takes an injectable `spawn` so tests assert call counts rather than wall clock.
- **It exists because 314 of 433 entries were paying for an answer nothing read.** `isStaleFromFields` returns before touching `changedPaths` for an exempt category, a closure-carrying entry, or an empty `governs`. Session start called git for all of them anyway: 433 spawns, 62.19s measured at `7fd51c0`. With `needsChangedSet` gating the call and the memo collapsing 119 requests to 8 distinct stamps, cold start is 0.98s and warm is 0.46s.
- **The cache holds changed-sets, never verdicts.** A changed-set depends on `(stamp, HEAD)` and nothing else, so editing a memory file cannot invalidate it. A cached verdict would depend on entry frontmatter too and would need invalidation on every `/memory-sync` write. The narrower thing removes the invalidation problem rather than solving it.
- **A failure is never cached.** A rejected stamp and a non-zero git exit both return `null` and write no memo row, so the predicate's "could not tell" state survives into the next run instead of hardening into a wrong answer. See [[staleness-is-witnessed-not-counted-2026-08-24]] for why the three states matter.
- Caveat: `asResolver` exists because `tests/sweep-staleness-parity.test.mjs` calls both `isStale` predicates with a repository root, and the spec committed to leaving that test unchanged. The fourth parameter accepts a root or a resolver; a root gets a one-off that still memoizes and still reads the cache.
- Caveat: the cache lives at `.claude/state/memory/changed-set-cache.json`, which is gitignored. A missing cache costs one cold run and nothing else.
- Caveat: the stamp still reaches a git argv, so `usableStamp` gates it before any argv is built. Cache keys are stamps read back off disk and are never iterated into a git command. See [[a-frontmatter-value-in-a-git-argv-is-an-option-injection-sink]].
