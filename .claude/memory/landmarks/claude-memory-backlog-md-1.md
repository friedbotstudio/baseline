---
key: .claude/memory/backlog.md:1
category: landmarks
scope: [scout]
---

- Role: The seventh canonical memory file. Captures future-work intent extracted automatically from user prompts (`source: user-instruction`) and assistant text (`source: assistant-deferral`) by `memory_stop.mjs:1`'s anchored line-start intent regex. Stable-key shape: `<8-word-kebab-slug>-<4-char-sha256-suffix>`. Body schema: required verbatim blockquote, `source`, `status: open|picked-up|dropped`, `raised-on`, `raised-in-context`, optional `estimated-effort`, optional `depends-on: [[other-backlog-key]]` links. Closure via `superseded-at:` (same register as the other five non-pending canonical files); body `status:` field disambiguates `picked-up` (taken into a workflow) vs `dropped` (decided not to do). Auto-deletes on the next `/memory-flush` Step 0a sweep once a valid `superseded-at:` lands.
- Companion: `.claude/hooks/memory_stop.mjs:1` (the producer), `.claude/skills/memory-flush/SKILL.md:1` (the curator), `.claude/skills/memory-flush/sweep.mjs:1` (the closure actuator; `STALE_EXEMPT_FILES = {'backlog'}` makes backlog entries decay-exempt), `.claude/hooks/memory_session_start.mjs:1` (the SessionStart index emitter; same stale-exempt carve-out so backlog never shows up in stale counts).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: backlog is **stale-exempt** — `verified-at:` distance is meaningless for intent (it's not a verifiable fact about code state). The 30-commit / 30-day decay predicates in `memory_session_start.mjs:_is_stale` and `sweep.mjs:is_stale` both early-return False for `name == 'backlog'`. Pruning still happens via `last-touched` ordering when the 500-entry size-cap is hit. The bootstrap entry that shipped with this file (`## bootstrap`, `superseded-at: 2026-05-17`) auto-deleted on the first Phase 10.6 invocation post-install — confirmed end-to-end in the backlog-memory-bucket workflow (archive: `docs/archive/2026-05-17/backlog-memory-bucket/`).
