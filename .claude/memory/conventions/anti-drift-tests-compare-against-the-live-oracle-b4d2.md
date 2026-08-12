---
key: anti-drift-tests-compare-against-the-live-oracle-b4d2
category: conventions
scope: [scenario, implement]
source: assistant-deferral
raised-on: 2026-08-12
raised-in-context: consumer-install-defects
verified-at: ce8c7cd
last-touched: 2026-08-12
governs: tests/build-template-memory-excludes.test.mjs
---

- Convention: a test asserting "roster X derives from oracle Y" compares the SET RELATIONSHIP between the two live modules, never against a frozen literal. `assert.deepEqual([...EXPECTED_MEMORY_FILES].sort(), [...CANONICAL, '_pending', '_resume', '_thread'].sort())`. A count claim in prose is built the same way — from `roster.size` — never pinned to the current number.
- Why: a literal in such a test becomes one more copy of the list the assertion exists to unify, and it passes while the oracle and its consumer silently diverge. The consumer-install-defects batch found SEVEN independent copies of one category list (build excludes, `expected-baseline.mjs`, `derive-counts.mjs`, `memory-shape.mjs`'s comment, two prose counts, and the README's "canonical seven"). A test pinned to `8` would have been the eighth.
- Applies beyond memory categories: any roster with more than one reader — hook names, skill slugs, MCP servers, workflow tracks.
- Related: [[shipped-file-pristine-is-byte-identity-not-a-heuristic-c8a7]].
