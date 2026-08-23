---
key: staleness-is-witnessed-not-counted-2026-08-24
category: decisions
load_bearing: true
scope: [triage, implement, integrate]
governs: .claude/hooks/lib/staleness.mjs, .claude/skills/memory-sync/sweep.mjs, .claude/hooks/lib/memory_session_start.mjs
verified-at: 2542786
last-touched: 2026-08-23
---

- **The decision.** A memory entry is stale when a path in its `governs:` list changed since its `verified-at` SHA. An entry with no `governs:` falls back to 30 days on `last-touched`. The commit-distance leg is gone.
- **Why the old leg was wrong.** A commit count measures how fast the repository moves, not whether an entry drifted. Measured 2026-08-23: 132 commits in 30 days made `STALE_COMMITS = 30` expire an entry after **four days**. 259 of 291 non-exempt entries read stale while only 33 were genuinely a month old, so the queue was uncleatable by construction and nobody ever cleared it.
- **The effect.** 259 offered entries became 63, and every one of the 63 has a governed path that really moved. 44 entries the old rule flagged were provably fine.
- **Three states, not two.** The witness answers moved / did not move / could not tell. "Could not tell" — an unresolvable stamp, a non-git tree, a failed git call, or a glob `glob-match` refuses — falls through to the date leg. Collapsing it into "did not move" reports an entry fresh at any age on the strength of a comparison that never ran. See [[a-frontmatter-value-in-a-git-argv-is-an-option-injection-sink]] for why the stamp is validated first.
- **Exemptions unchanged.** `backlog` stays STALE_EXEMPT and `decisions` stays SUPERSESSION_DRIVEN, for the reasons `categories.mjs` already records.
- **One home.** The predicate lives in `.claude/hooks/lib/staleness.mjs` and both readers import it, per [[a-rule-shared-by-a-guard-and-its-preflight-lives-in-one-module]]. The threshold was previously declared twice and `tests/sweep-staleness-parity.test.mjs` exists because the copies drifted; with one predicate the parity holds by construction.
