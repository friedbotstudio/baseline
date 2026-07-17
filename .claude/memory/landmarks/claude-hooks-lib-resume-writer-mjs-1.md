---
key: .claude/hooks/lib/resume_writer.mjs:1
category: landmarks
scope: [scout]
---

- Role: Continuity-snapshot writer — composes `.claude/memory/_resume.md` from the per-turn transcript JSONL + `.claude/state/workflow.json` + harness logs. Walks the transcript for last-K user prompts, last-K file writes, last-K Skill invocations, last-K Bash commands; merges with workflow state (slug, entry phase, last completed, next phase due); writes a markdown snapshot consumed by the next SessionStart's memory-index injection. Shared by `memory_pre_compact.mjs` (PreCompact event) and `memory_stop.mjs` (Stop event). Exports `composeSnapshot(...)` (pure) and `writeSnapshot(...)` (file I/O).
- Companion: `.claude/hooks/lib/memory_session_start.mjs:1` (consumes the snapshot at session start), `.claude/hooks/lib/memory_stop.mjs:1` (its intent-extractor mirrors the same text-block walk + noise filters).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: ported byte-for-byte from `lib/resume_writer.py` (2026-05-27 perf pass). Best-effort: every failure path returns null silently.
