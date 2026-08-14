---
key: .claude/skills/harness/assemble-context.mjs
category: landmarks
scope: [scout]
governs: .claude/skills/harness/assemble-context.mjs
role: Builds the code-review fan-out's changedFiles input, which no producer supplied before. describeInputState is the load-bearing half — it separates `no-input` from `measured`, so a CLEAN verdict from an empty diff can no longer be spelled the same way as a CLEAN verdict from a real one. Every archived checker-fanout-code result before this read {"findings":[],"verdict":"CLEAN"} and none of them had seen a file.
source: inferred-from-code
verified-at: 66fcb29
last-touched: 2026-08-14
---


