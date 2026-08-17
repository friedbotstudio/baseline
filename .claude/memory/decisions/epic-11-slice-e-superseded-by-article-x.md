---
key: epic-11-slice-e-superseded-by-article-x
category: decisions
scope: []
governs: .claude/state/epic/mvp-sprint-parallel-cycles.json, .claude/skills/commit/epic_close.mjs
load_bearing: true
source: inferred-from-code
verified-at: 309d70e
last-touched: 2026-08-17
---

- Decision: Epic 11 slice E ("Bounded charter §II.B sanctioning the sprint sandbox") is **closed by supersession, not built**. Article X of CLAUDE.md is the bounded charter for multi-session coordination; building a second one would put two charters in the constitution.

**The authority is genesis, not judgement.** `docs/init/seed.md:217` states that Article X graduates and supersedes "the retired `sprint-dispatch` prototype **and the `mvp-sprint-parallel-cycles` Slice E reserved-charter slot**". Under Art. I.4 seed.md outranks both the constitution and the implementation, so an epic state still carrying E as open is the drift, not the seed.

**Why the state file says `committed` when nothing was committed.** `epic_close.mjs:50` is `children.filter((c) => c.status !== 'committed')` — the child-status vocabulary is binary, and every value other than the literal `committed` counts as OPEN. Writing an honest `superseded` there would deadlock the epic: it could never close once slice D lands. The compromise is `status: "committed"` plus `resolution: "superseded"`, `superseded_by`, and a `resolution_note` naming this constraint. The extra fields are inert to `epic_close.mjs` and preserve the truth for a reader.

**Do not "fix" the status string without fixing the oracle first.** Changing it to `superseded` in isolation silently prevents the epic from ever closing. The repair is a closed-status set in `epic_close.mjs` — see [[epic-close-has-no-superseded-status]].

**The roadmap says superseded, not done.** `docs/roadmap-execution-plan.md` Epic 11 row E reads `✅ E. Bounded charter for the sprint sandbox — SUPERSEDED, not built: Article X absorbed this slot per seed.md §4.2`. One status emoji, so `TASK_LINE` in `roadmap-sync/sync.mjs` still parses it; the prose carries what the emoji cannot.

Related: [[epic-11-slice-d-needs-respec-against-org-dispatch]] — the sibling slice is stale for the same reason (both were written against `sprint-dispatch`), but D is stale rather than superseded and still has real work in it.
