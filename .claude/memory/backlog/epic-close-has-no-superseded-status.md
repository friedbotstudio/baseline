---
key: epic-close-has-no-superseded-status
category: backlog
scope: []
governs: .claude/skills/commit/epic_close.mjs
status: picked-up
source: inferred-from-code
deferred: cost
raised-on: 2026-08-17
raised-in-context: epic11-slice-e-superseded
verified-at: 309d70e
last-touched: 2026-08-17
superseded-at: 2026-08-19
---

- **The defect.** `epic_close.mjs:50` reads `return children.filter((c) => c.status !== 'committed');`. The child-status vocabulary is therefore binary: `committed`, or open. There is no way to record a slice that was resolved *without* landing a commit.
- **What it costs today.** Epic 11 slice E was closed by supersession (seed.md:217 retired the slot). The only status that lets the epic ever close is the literal `committed` — a factual misstatement, since no commit implements slice E. It was written anyway, with `resolution: "superseded"` alongside it, because the alternative was an epic permanently stuck open. See [[epic-11-slice-e-superseded-by-article-x]].
- **Shape of the fix.** Introduce a closed-status set (`committed | superseded`) and drive `openChildren` from membership in it rather than from equality with one string. `closedChildren` at line 55 (`c.status === 'committed'`) needs the same treatment, and the two should read from one exported constant so they cannot drift apart.
- **Guard the migration.** Existing epic states carry only `committed`, so widening the accepted set is backward-compatible; narrowing it later would not be. A test should pin that an epic with one `superseded` child and the rest `committed` closes, and that an epic with any genuinely-open child does not.
- Reason `cost`: this is a runtime behaviour change to the epic-close fold, so it needs a failing test first and does not belong on the chore track that discovered it.
