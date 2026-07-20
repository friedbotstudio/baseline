---
key: src/cli/workflow-migrator.js:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: Foundation — one-shot in-place migrator for pre-§18 `workflow.json` (`entry_phase`, no `track_id`) → post-§18 shape. Derives `track_id` via `ENTRY_PHASE_TO_TRACK_ID` (intake→intake-full, spec→spec-entry, tdd→tdd-quickfix, chore→chore), remaps `completed[]` to node-ids, inits `skipped_alternates: []`, removes `entry_phase`. Idempotent. Unmapped `entry_phase` throws. Invoked by `harness/SKILL.md` preflight Step 3a. Reverse-map mirrored in `track_guard.sh` + `lib/resume_writer.py` for both-shape runtime acceptance.
- Companion: `.claude/skills/harness/SKILL.md`, `.claude/hooks/track_guard.sh:1`, `.claude/hooks/lib/resume_writer.py:1`, `tests/workflow-migrator.test.mjs`.
- Caveat: non-atomic write — backlog `workflow-migrator-write-not-atomic-power-loss-corruption-3e91`.
