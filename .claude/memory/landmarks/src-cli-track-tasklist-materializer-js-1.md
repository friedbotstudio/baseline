---
key: src/cli/track-tasklist-materializer.js:1
category: landmarks
scope: [scout]
---

- Role: Foundation — Track → canonical TaskList JSON (subjects, activeForms, metadata.phase, needs_user, blockedBy ordinals). Selector nodes via `evaluateAlternates(node, ctx)` (filter by `preconditions[]`; first qualifying alternate wins). Sub-tracks via `expandSubTrack` (inline nodes; propagate parent `depends_on` to entry nodes so the chain links cleanly). Used by `triage/seed-tasklist.mjs` and `tests/track-tasklist-materializer.test.mjs` against golden fixtures (byte-equivalent migration coverage).
- Companion: `.claude/skills/triage/seed-tasklist.mjs`, `tests/fixtures/golden-tasklists/*.golden.json`, `src/cli/workflows-validator-predicates.js:1`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
