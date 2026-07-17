---
key: .claude/hooks/lib/memory_session_start.mjs:1
category: landmarks
scope: [scout]
---

- Role: SessionStart memory-index builder — invoked by `.claude/hooks/memory_session_start.mjs` (the hook). Reads the seven canonical memory files, counts entries + stale entries (verified-at ≥ 30 commits behind HEAD in git, last-touched ≥ 30 days in non-git), counts pending candidates in `_pending.md`, scans `.claude/state/upgrade/*/manifest.json` for entries with `status: PENDING`, composes the additionalContext JSON envelope including index table, top-5 stale-entries block, pending-flush nag (debt-mode only when no active workflow), pending-stage nag, and resume-snapshot injection from `_resume.md` when fresh. Exports `buildIndex({ memDir, projectRoot, sessionSource })`.
- Companion: `.claude/hooks/memory_session_start.mjs` (the hook that invokes this), `.claude/skills/memory-flush/sweep.mjs:1` (Step 0c stale-sweep re-derives the same predicate), `.claude/hooks/lib/resume_writer.mjs:1` (writes the `_resume.md` this builder injects).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: ported byte-for-byte from `lib/memory_session_start.py` (2026-05-27 perf pass). Stale predicate duplicated with `sweep.mjs` Step 0c — keep in lockstep. Total context capped at ~10KB.
