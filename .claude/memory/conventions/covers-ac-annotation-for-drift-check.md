---
key: covers-ac-annotation-for-drift-check
category: conventions
scope: [scenario, tdd]
source: code-pattern
convention: `drift_check.mjs` (the tdd drift-check-tick) marks a spec AC `resolved` only when its literal id token (`AC-001`) appears in an IMPLEMENTATION or TEST added-line of the branch diff — never in the spec markdown's own `| AC-NNN |` rows. A test suite that covers an AC via test NAMES + a coordinator `covers` mapping but never writes the literal `AC-NNN` token into the diff is scored `unresolved`, yielding a false-positive drift YIELD at the drift-check-tick. Add a `// Covers AC-NNN.` comment to each test (or impl) so true coverage is visible to the heuristic. This is the same annotation shape `drift_check.mjs`'s own header uses, and it advances backlog `annotate-test-files-with-covered-acs-c2a1`.
why: the drift heuristic is diff-token-based, not semantic — it cannot see the `covers` field in `.claude/state/tdd/<slug>.json`. Annotating the tests documents real coverage without changing any assertion (not gaming — the tests already pass and map to those ACs).
applies-to: any spec-track workflow whose tests cover ACs; add `// Covers AC-NNN.` per test at authoring time to avoid a spurious drift-check yield.
verified-at: 6ddda04
last-touched: 2026-07-21
---

- how to apply: when the scenario tick writes tests, put a `// Covers AC-NNN.` comment in each test body naming the AC(s) it defends. Multiple ACs per test → list them (`// Covers AC-002, AC-004.`). Verify with `node .claude/skills/tdd/drift_check.mjs --slug <slug>` (exit 0 = all resolved).
