---
key: .claude/skills/memory-index/resolve.mjs:59
category: landmarks
scope: any
governs: .claude/skills/memory-index/**,.claude/hooks/lib/governed-memory.mjs,.claude/skills/memory-flush/**
load_bearing: true
verified-at: 39464a1
last-touched: 2026-08-04
---

- Path: `.claude/skills/memory-index/resolve.mjs`. The derived index (spec ticket C, epic decision D8).
- Role: exports `resolveLookup(kind, needle, {rootDir})` over three reverse-lookup kinds — `by_path` (glob-matched against `governs:`), `by_constraint` (membership in `rests_on:`), `by_element` — and `backfillScopeAny({rootDir})` for rollout prerequisite P2.
- **There is no cache, deliberately.** Measured 2026-08-04 on the live 239-entry store: a full walk costs 17.5 ms; the HEAD-keyed cache it replaced cost ~29 ms because `gitHead()` shelled out to git on every call. The cache was slower *and* wrong — on a non-git tree `gitHead()` returns `''` forever, so `built_at` never changed, the index never rebuilt, and a shard added mid-session was invisible. This settled the epic's open "measure before choosing" question in favour of build-on-demand.
- A structural match carries `key` + `category` only — **no verbatim, no interpretation** (AC-005). Reasons belong to the surfacing leg (`governed-memory.mjs`), which composes this one.
- `splitFrontmatter()` bounds both the `scope:` probe and the rewrite to the frontmatter block. An unanchored `/m` regex over the whole file read a **body** line beginning `scope:` as the field and skipped the entry, leaving the fact unreachable — exactly what AC-011 forbids (security review F-2). Entries in this corpus routinely quote frontmatter keys while documenting the schema, so that collision is ordinary, not exotic.
- `backfillScopeAny` stamps `scope: any`, never a per-category default. Epic decision D7: a per-category default is what stamped `scope: [spec]` onto decisions and caused the surfacing defect this batch exists to fix. It treats `scope: []` as equally unreachable as an absent `scope:`; frontmatter-only, body byte-identical, idempotent.
- Companion: `.claude/skills/memory-index/index-io.mjs:12` (its Foundation), `.claude/hooks/lib/governed-memory.mjs:51` (its consumer).
