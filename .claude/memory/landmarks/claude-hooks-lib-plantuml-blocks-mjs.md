---
key: .claude/hooks/lib/plantuml-blocks.mjs
category: landmarks
scope: []
governs: .claude/hooks/lib/plantuml-blocks.mjs, .claude/hooks/spec_diagram_presence_guard.mjs, .claude/skills/spec-lint/lint.mjs
verified-at: 3c08c8a
last-touched: 2026-08-26
---

- Path: `.claude/hooks/lib/plantuml-blocks.mjs`. Exports `plantumlBlocks(content)`, `blockSatisfies(body, rule)` and `missingKinds(blocks, required)` — the diagram-kind detection shared by `spec_diagram_presence_guard` and `/spec-lint`.
- Created 2026-08-25 by deleting the duplicate copy the two callers each carried. Third live instance of [[a-rule-shared-by-a-guard-and-its-preflight-lives-in-one-module]]; sibling of [[.claude/hooks/lib/corpus-reference.mjs]].
- The pairing to remember: `plantuml-blocks.mjs` answers *which kinds does this spec draw*, `corpus-reference.mjs` answers *which kinds does it satisfy by reference instead*. Both feed the same verdict, and a change to one without the other is how the guard and its preflight drift apart.
