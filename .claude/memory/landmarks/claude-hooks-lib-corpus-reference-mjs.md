---
key: .claude/hooks/lib/corpus-reference.mjs
category: landmarks
scope: []
governs: .claude/hooks/lib/corpus-reference.mjs, .claude/hooks/lib/write-set-profile.mjs, .claude/hooks/spec_diagram_presence_guard.mjs, .claude/skills/spec-lint/lint.mjs
verified-at: 3c08c8a
last-touched: 2026-08-26
---

- Path: `.claude/hooks/lib/corpus-reference.mjs`. Owns the `@ref element:<id>` grammar and nothing else — 23 substantive lines, stdlib-only, content-only.
- Exports `REF_TOKEN`, `REF_PLACEHOLDER`, `REF_WELL_FORMED`, `STRUCTURAL_KINDS`, `maskInlineCode`, `referenceTokens`, `malformedReferences`, `hasMalformedReference`, `elementReferences`. Read by `spec_diagram_presence_guard`, by `/spec-lint`, and by `write-set-profile.mjs`, which imports `malformedReferences` rather than defining it.
- Split out of `write-set-profile.mjs` on 2026-08-25. That module is the write-set and diagram-profile resolver; the reference grammar was a second subject sharing the file. See [[a-rule-shared-by-a-guard-and-its-preflight-lives-in-one-module]] — the convention asks for one module per rule, not one module per caller pair.
- **`maskInlineCode` masks inline spans only, never fenced blocks.** A fenced block is exactly how the artifact template presents the declaration slot, so masking fences denies the `@ref` carve-out to everyone who copies the template. `tests/corpus-recall-reachability` catches the wrong version.
