---
key: .claude/skills/triage/seed-tasklist.mjs:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Foundation helper for `triage` (post-§18). Node ESM CLI; two modes — `--validate-only` (validate via `workflows-validator.js`; non-zero on first invariant violation) and `<track_id> <slug>` (materialize via `track-tasklist-materializer.js`; print TaskList JSON for triage's `TaskCreate` loop). Slug regex `^[a-z0-9][a-z0-9-]{0,63}$` (backlog `triage-helper-slug-interpolation-into-bash-subprocess-a720`).
- Companion: `.claude/skills/triage/SKILL.md:1`, `src/cli/workflows-validator.js:1`, `src/cli/track-tasklist-materializer.js:1`.
