---
key: .claude/skills/memory-index/resolve.mjs:95
category: landmarks
load_bearing: true
scope: []
governs: .claude/skills/memory-index/**, .claude/hooks/lib/governed-memory.mjs, .claude/skills/memory-sync/**
verified-at: 5f52ba2
last-touched: 2026-08-27
---

- Path: `.claude/skills/memory-index/resolve.mjs`. The derived index (spec ticket C, epic decision D8). The key was `:59` until 2026-08-27; that line is now a closing brace and `resolveLookup` sits at `:95`. The filename slug still carries the old number and is left alone, because it is an identifier rather than a citation.
- Role: exports `resolveLookup(kind, needle, {rootDir})` over three reverse-lookup kinds — `by_path` (glob-matched against `governs:`), `by_constraint` (membership in `rests_on:`), `by_element` — plus the reachability predicate `isReachable(entry)`, its write-boundary assertion `assertWritable(entry)` / `UnreachableScopeError`, and `splitFrontmatter` (shared with `scope-narrow.mjs`).
- **This entry's no-cache decision does not contradict [[claude-hooks-lib-memory-changed-set-mjs]].** The index is rebuilt on demand because a full walk costs 17.5 ms and needs no git; the changed-set is cached because each answer costs a ~160 ms git spawn. Same question, opposite answers, because the measured cost differs by four orders of magnitude. Measure before choosing, in both directions.
- **There is no cache, deliberately.** Measured 2026-08-04 on the live 239-entry store: a full walk costs 17.5 ms; the HEAD-keyed cache it replaced cost ~29 ms because `gitHead()` shelled out to git on every call. The cache was slower *and* wrong — on a non-git tree `gitHead()` returns `''` forever, so `built_at` never changed, the index never rebuilt, and a shard added mid-session was invisible. This settled the epic's open "measure before choosing" question in favour of build-on-demand.
- A structural match carries `key` + `category` only — **no verbatim, no interpretation** (AC-005). Reasons belong to the surfacing leg (`governed-memory.mjs`), which composes this one.
- `splitFrontmatter()` bounds both the `scope:` probe and the rewrite to the frontmatter block. An unanchored `/m` regex over the whole file read a **body** line beginning `scope:` as the field and skipped the entry, leaving the fact unreachable — exactly what AC-011 forbids (security review F-2). Entries in this corpus routinely quote frontmatter keys while documenting the schema, so that collision is ordinary, not exotic.
- **`backfillScopeAny` is REMOVED (roadmap T8), and the reason matters.** It stamped `scope: any` on unscoped facts so no fact would be unreachable. The reader never honoured it — `scoped-memory.mjs` matches a phase with `asArray(scope).includes(phase)`, and `['any'].includes('spec')` is `false` — so all 47 stamped entries surfaced at **zero** phases. The repair produced the condition it was written to end, and `README.md` plus `memory-sync/SKILL.md` both documented the intent as though it worked.
- Reachability is now a predicate over **both legs**, not a scope value: `isReachable(entry)` is true when `scope:` names a phase **or** `governs:` names a glob. That is what made removing the placeholder safe — a `governs:`-only entry was always reachable via the path leg, and it was the single-leg check that made it look orphaned. `assertWritable` additionally refuses a scope silently inherited from `SCOPE_BY_CATEGORY` (exported from `migrate.mjs` for exactly this check), because that inheritance is what stamped all 87 landmarks and all 49 landmines.
- Companion: `.claude/skills/memory-index/index-io.mjs:12` (its Foundation), `.claude/hooks/lib/governed-memory.mjs:51` (its consumer).
