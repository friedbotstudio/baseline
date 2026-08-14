---
key: .claude/hooks/lib/memory_session_start.mjs:1
category: landmarks
scope: []
governs: .claude/hooks/lib/memory_session_start.mjs, .claude/hooks/memory_session_start.mjs, .claude/skills/memory-sync/sweep.mjs
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: SessionStart memory-index builder — invoked by `.claude/hooks/memory_session_start.mjs` (the hook). Exports `buildIndex({ memDir, projectRoot, sessionSource })` and re-exports `CANONICAL`. Reads the **eight** canonical categories (flat or sharded), counts entries + stale entries, counts pending candidates in `_pending.md`, scans `.claude/state/upgrade/*/manifest.json` for `status: PENDING`, and composes the additionalContext envelope: index table, top-5 stale block, pending-flush nag (debt-mode only when no active workflow), pending-stage nag, and resume-snapshot injection from `_resume.md` when fresh.
- The category list is **imported from `.claude/skills/memory-index/categories.mjs`**, not held here as a literal. It also imports `STALE_EXEMPT` and `SUPERSESSION_DRIVEN` — the decay classes. A `SUPERSESSION_DRIVEN` category (decisions) never ages out by elapsed time: an open decision is still in force however old the commit that verified it. That change took decisions reading stale from 26 to 0 and whole-store stale from 173 to 147.
- `suspectDecisions(memDir)` (line 203) is AC-004's payoff and the edge that earns `constraints` its own category: every constraint whose `state` reads false is paired with the decisions naming it in `rests_on:` and surfaced under "## Decisions resting on a constraint that no longer holds". `decisionsRestingOn` existed for a while with nothing walking it, so a flipped constraint invalidated nothing anywhere a human would see it. Fail-open — no constraints, or an unreadable store, yields `[]`.
- Companion: `.claude/skills/memory-index/categories.mjs:1` (the category + decay source), `.claude/skills/memory-index/constraints.mjs:41` (the invalidation walk), `.claude/skills/memory-sync/sweep.mjs:1` (Step 0c re-derives the same stale predicate), `.claude/hooks/lib/resume_writer.mjs:1` (writes the `_resume.md` this injects).
- Caveat: originally ported byte-for-byte from `lib/memory_session_start.py` (2026-05-27 perf pass). The stale predicate is duplicated with `sweep.mjs` Step 0c — keep in lockstep. Total context capped at ~10KB.
