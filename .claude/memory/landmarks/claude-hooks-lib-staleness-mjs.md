---
key: .claude/hooks/lib/staleness.mjs
category: landmarks
scope: [tdd, integrate]
governs: .claude/hooks/lib/staleness.mjs, .claude/skills/memory-sync/sweep.mjs, .claude/hooks/lib/memory_session_start.mjs
source: inferred-from-code
verified-at: 2542786
last-touched: 2026-08-24
---

- Role: Foundation. The memory decay predicate, declared once. Landed by `staleness-witness` (2026-08-24) and anchored in the corpus as element `staleness-predicate`.
- Exports `isStaleFromFields`, `usableStamp`, `governsMatches`, `splitList`, and `STALE_DAYS`. The private `witness()` is the actual rule; the two public faces differ only in what they do with an unanswerable question.
- **Two readers, one predicate.** `memory-sync/sweep.mjs` and `hooks/lib/memory_session_start.mjs` each keep their own frontmatter parsing and their own `git diff --name-only <sha>..HEAD` call, then pass the fields in. The split is at the IO boundary, not the logic, so the rule stays pure and testable without git.
- **`witness()` returns three states and that is the whole design.** `true` a governed path moved, `false` none did, `null` the question could not be answered. Collapsing `null` into `false` reports an entry fresh at any age on a comparison that never ran — which is the bug the first attempt at this shipped, caught by its own test.
- The commit-distance leg it replaced was not a second opinion on the date leg. At 132 commits in 30 days a 30-commit threshold expired an entry after four days, so 259 of 291 non-exempt entries read stale while 33 were genuinely a month old. See [[staleness-is-witnessed-not-counted-2026-08-24]].
- Caveat: `usableStamp` is a security boundary, not a tidiness check. It rejects anything that is not a git short SHA because the stamp reaches a git argv. See [[a-frontmatter-value-in-a-git-argv-is-an-option-injection-sink]].
- Caveat: `scope:` deliberately omits `spec`. The spec phase's surfaced-entry budget sits at its cap with zero headroom, and this entry is about implementing against the predicate rather than authoring a spec.
