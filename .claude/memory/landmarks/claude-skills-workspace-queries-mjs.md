---
key: .claude/skills/workspace/queries.mjs
category: landmarks
scope: []
governs: .claude/skills/workspace/queries.mjs, .claude/skills/workspace/cli.mjs, .claude/skills/workspace/graph.mjs, .claude/schemas/graph-document.v1.json
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/workspace/queries.mjs`. Domain — the nine corpus queries the workspace dispatcher exposes: `describeElement`, `blastRadius`, `describeConcept`, `coverage`, `stale`, `constraintsFor`, `view`, `graph`, `flagStates`. Each returns `{text, data}`; nothing here knows about stdout or exit codes.
- **Look here, not in `cli.mjs`.** The dispatcher is 26 substantive lines of wiring — a table of contents. It was split at the `/simplify` pass when the combined file hit 198 lines against the ~80 ceiling, and multi-hop reachability in particular is a graph traversal rather than an entry point.
- `.claude/skills/workspace/graph.mjs` is the sibling that builds the `GraphDocument`. Its `targetKind` field is load-bearing: 46 of the 124 live edges point at a `project.json` key rather than an element, because `scanConfigKeys` targets the KEY deliberately — nothing anchors `project.json`. A consumer that assumes every `to` resolves to a node draws 46 dangling lines.
- `corpusDir()` lives here and validates `--spec-dir` with `assertNoTraversal` when relative, accepting absolute paths as-is. `memory-sync` and `system-reconcile` originally accepted the same flag with NO validation while this one checked it; that asymmetry was closed at `/simplify` 2026-08-08 and is the reason all three now import the same guard.
- Related: [[claude-skills-lib-argv-mjs]] is the Foundation layer beneath it.

- load_bearing: true
