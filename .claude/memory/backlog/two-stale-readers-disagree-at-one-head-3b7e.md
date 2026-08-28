---
key: two-stale-readers-disagree-at-one-head-3b7e
category: backlog
scope: [memory-sync, triage]
governs: .claude/hooks/lib/memory_session_start.mjs, .claude/skills/memory-sync/sweep.mjs
surfaces-on: .claude/memory/**, .claude/hooks/lib/memory_session_start.mjs, .claude/skills/memory-sync/**
status: open
deferred: dependency
raised-on: 2026-08-29
raised-in-context: stale-keying-and-glob-scope
source: user-instruction
estimated-effort: medium (dump both readers' key sets at one fixed HEAD, then diff)
verified-at: e9a5893
last-touched: 2026-08-29
---

> verbatim (user, 2026-08-26):
> "Both readers call the same predicate and the predicate is consistent, so the difference is in how each one reads the store — I did not chase it further. It matters because the 15 entries the sweep cannot reach are ones the self-healing loop never offers you. Worth a look on its own, separately from this release."

- Intent: find why the session-start index and `/memory-sync` Step 0c report different stale sets over the same store at the same HEAD, and close the gap so every stale entry the reader names is one the sweep can actually offer.
- Reported from a downstream install: the index said ~23 stale, the sweep surfaced ~8. The same install measured 21 vs 7 before upgrading, so the gap is not new and is not a migration artifact.
- **A second, sharper measurement, 2026-08-29 on this repo.** Session start reported 4 stale and named three of them. Their `verified-at` values resolve to `7d7039c` and `5f52ba2`, which `git rev-list --count` puts at **6 and 1 commits behind HEAD** — both far under the 30-commit threshold. Their `last-touched` dates were 2 and 3 days old, far under 30 days. By the documented predicate none of them should have been stale at all. The sweep, run over the same store minutes later, surfaced 4 and closed none.
- Why it matters: an entry the index calls stale but the sweep never offers is an entry the self-healing loop cannot reach. It also trains the reader to distrust the count, which is the same damage [[stale-count-is-dominated-by-a-migration-cohort-15a1]] describes from a different cause. That entry is about a cohort inflating a correct number; this one is about two readers producing different numbers, and they are not the same bug.
- The obvious next step is mechanical: dump both readers' stale key sets at one fixed HEAD and diff them. `tests/sweep-staleness-parity.test.mjs` already pins the two *predicates* equal entry-by-entry, so whatever differs is upstream of the predicate — in how each reader enumerates or resolves the store.
- Deferred on dependency: the diff needs both readers instrumented to emit their key sets, which no current flag does.
