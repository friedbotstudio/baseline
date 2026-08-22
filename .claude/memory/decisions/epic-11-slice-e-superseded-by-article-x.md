---
key: epic-11-slice-e-superseded-by-article-x
category: decisions
scope: []
governs: .claude/state/epic/mvp-sprint-parallel-cycles.json, .claude/skills/commit/epic_close.mjs
load_bearing: true
source: inferred-from-code
verified-at: 3eafe4f
last-touched: 2026-08-22
---

- Decision: Epic 11 slice E ("Bounded charter §II.B sanctioning the sprint sandbox") is **closed by supersession, not built**. Article X of CLAUDE.md is the bounded charter for multi-session coordination; building a second one would put two charters in the constitution.

**The authority is genesis, not judgement.** `docs/init/seed.md:217` states that Article X graduates and supersedes "the retired `sprint-dispatch` prototype **and the `mvp-sprint-parallel-cycles` Slice E reserved-charter slot**". Under Art. I.4 seed.md outranks both the constitution and the implementation, so an epic state still carrying E as open is the drift, not the seed.

**Why the state file says `committed` when nothing was committed.** `epic_close.mjs` then read `children.filter((c) => c.status !== 'committed')` (at line 50 before the 2026-08-22 repair; the filter is now `!isClosed(c.status)`) — the child-status vocabulary is binary, and every value other than the literal `committed` counts as OPEN. Writing an honest `superseded` there would deadlock the epic: it could never close once slice D lands. The compromise is `status: "committed"` plus `resolution: "superseded"`, `superseded_by`, and a `resolution_note` naming this constraint. The extra fields are inert to `epic_close.mjs` and preserve the truth for a reader.

**The oracle was repaired on 2026-08-22; the workaround is no longer needed.** Epic 13 slice E added `CLOSED_STATUSES = [committed, superseded]` and `isClosed()` to `epic_close.mjs`, so a `superseded` child now counts as closed and cannot deadlock its epic. The binary `status !== 'committed'` test that forced the `committed` + `resolution: superseded` compromise above is gone. Slice D of this epic is now recorded honestly as `status: "superseded"` with `superseded_by: baseline-mcp`. Slice E keeps its original compromise shape, which still reads as closed under the widened set — rewriting it would edit history for no behavioural gain. The rule that produced this entry (do not change the status string without fixing the oracle first) was followed: the oracle was fixed first. See [[epic-close-has-no-superseded-status]].

**The roadmap says superseded, not done.** `docs/roadmap-execution-plan.md` Epic 11 row E reads `✅ E. Bounded charter for the sprint sandbox — SUPERSEDED, not built: Article X absorbed this slot per seed.md §4.2`. One status emoji, so `TASK_LINE` in `roadmap-sync/sync.mjs` still parses it; the prose carries what the emoji cannot.

Related: [[epic-11-slice-d-needs-respec-against-org-dispatch]] — the sibling slice is stale for the same reason (both were written against `sprint-dispatch`), but D is stale rather than superseded and still has real work in it.
