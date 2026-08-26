---
key: coverage-alarm-fixture-derives-zero-elements-9a3c
category: backlog
scope: [integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-26
raised-in-context: stale-memory-reverification
governs: tests/workspace-coverage.test.mjs, .claude/skills/workspace/materialize.mjs, .claude/skills/workspace/coverage.mjs
verified-at: 7d7039c
last-touched: 2026-08-26
deferred: cost
---

> The corpus-decay alarm has never fired, and it cannot, because its fixture hands it nothing to measure.

- **The defect.** `materializedCorpus()` (`tests/workspace-coverage.test.mjs:25`) calls `materialize({specDir, rootDir: REPO_ROOT})` against a fresh `makeProject()` tmpdir. `materialize` reads its concept map from `specDir`, which has no `concepts/`, so it derives 0 elements. `findGaps` then short-circuits on `if (!anchors.length) return []` and the assertion at :40 is `deepEqual([], [])` on every run.
- **Measured 2026-08-26 at 7d7039c.** The fixture returns `{elements: 0, concepts: 0}` and `findGaps` over it returns 0, while `findGaps` over the live `docs/system/` returns **16**. The epic spec names this test the corpus-decay alarm — "a non-empty result fails CI" — and it has been green throughout.
- **Fix shape.** Point the fixture at the live `docs/system/` corpus, or seed the tmpdir with a concept map first. Either way, assert `elements.length > 0` before asserting anything about gaps, so the fixture cannot go empty again without failing.
- **Do not fix by asserting the 16 gaps away.** They are the alarm's real subject; `/archive` Step 5.5 reports them and deliberately never gates on them. The bug is that this test measures nothing, not that the corpus has gaps.
- Recorded while re-verifying [[a-check-that-measured-nothing-reports-success]], whose Instance 3 describes this exact case. That entry reads as history; the measurement above says it is still live.
