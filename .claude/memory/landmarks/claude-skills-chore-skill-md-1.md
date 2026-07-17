---
key: .claude/skills/chore/SKILL.md:1
category: landmarks
scope: [scout]
---

- Role: alternate workflow track for tasks that need no TDD — documentation edits, governance count bumps, vendored-skill content updates, configuration tweaks, formatting, typo fixes, dependency bumps where no project code changes, skill consolidations. Skips `/scenario` and `/implement` (no failing test to drive); runs the edits directly; conditionally routes through `simplify` / `integrate` / `document` based on diff triggers. `verify`, `archive`, `/grant-commit`, `/commit` remain mandatory. Selected at `/triage` time when the request matches the chore predicate; recorded as `track_id: chore` in `.claude/state/workflow.json` (post-§18; legacy `entry_phase: chore` accepted on pre-§18 workflows).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: chore is a stripped-down pipeline, not a bypass — silently skipping a triggered conditional phase (e.g., `document` when prose was touched) violates Article IV. The conditional-phase trigger predicates live inside this SKILL.md body and are the authoritative list; the `triage` skill mirrors them when routing.
