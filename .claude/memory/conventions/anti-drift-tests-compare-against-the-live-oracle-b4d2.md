---
key: anti-drift-tests-compare-against-the-live-oracle-b4d2
category: conventions
scope: [scenario, implement]
source: assistant-deferral
raised-on: 2026-08-12
raised-in-context: consumer-install-defects
verified-at: 69c3259
last-touched: 2026-08-19
governs: tests/build-template-memory-excludes.test.mjs
---

- Convention: a test asserting "roster X derives from oracle Y" compares the SET RELATIONSHIP between the two live modules, never against a frozen literal. `assert.deepEqual([...EXPECTED_MEMORY_FILES].sort(), [...CANONICAL, '_pending', '_resume', '_thread'].sort())`. A count claim in prose is built the same way — from `roster.size` — never pinned to the current number.
- Why: a literal in such a test becomes one more copy of the list the assertion exists to unify, and it passes while the oracle and its consumer silently diverge. The consumer-install-defects batch found SEVEN independent copies of one category list (build excludes, `expected-baseline.mjs`, `derive-counts.mjs`, `memory-shape.mjs`'s comment, two prose counts, and the README's "canonical seven"). A test pinned to `8` would have been the eighth.

**The landmine rung has been tried and does not hold. Counted 2026-08-13.** Across the two-commit session `79e41cb`..`c53a121` this pattern required **eight** literal corrections in four separate sittings, while three memory entries describing it were live and being actively written:

| Literal | Corrections | Sequence |
|---|---|---:|
| `PHASE_BUDGETS.spec` | 4 | 65 → 67 → 68 → 69 → 71 |
| landmarks at `scope: [scout]` | 2 | 87 → 88 → 89 |
| `resolve.mjs` path leg | 1 | 11 → 12 |
| `checker-fanout.mjs` path leg | 1 | 8 → 9 |

Every correction was mechanical and correct. None was preventable by remembering harder — the entries were not merely present, they were being *authored* in the same sittings, and two of the eight were caused by writing them. **A pattern that recurs while its own landmine is being written is past the advisory rung.** See the graduation proposal in the 2026-08-13 retrospective.

**The pattern outlived that batch.** `diagram-shard-rewrite-loses-fields` (2026-08-13) hit three more instances of the same shape, none of them category lists: a test literal at `87` for a landmark census, a phase budget at `65`, and `docs/roadmap-execution-plan.md` T11 quoting both numbers back as prose. Eleven copies across two tickets. The lesson generalises past the list that produced it — **any number a test or a document asserts about live state is a copy of an oracle, and it drifts the moment the oracle moves.** Before pinning one, ask what would have to be re-measured to know it is still true, and prefer asserting the relationship. See [[census-and-budget-are-different-numbers]] for when a literal legitimately has to stay.
**The rule has a second face: a FIXTURE is an oracle copy too.** `standup-remote-freshness` (2026-08-13) found a bucket that rendered `0` unconditionally and had survived a green suite for weeks. `.claude/skills/standup/render.mjs` iterated the display labels and indexed `backlog['picked-up']`, while `gather.mjs` emits the key `pickedUp`. The suite missed it because `tests/standup-render.test.mjs:32` hand-wrote its fixture as `{ open: [], 'picked-up': [], dropped: [] }` — **the renderer's wrong key shape, not the producer's**. The test agreed with the bug instead of with the code that feeds it.

Every literal above is a copy of an oracle's *output*; a hand-written fixture is a copy of an oracle's *shape*, and it drifts the same way. Build the fixture by calling the real producer (`gatherSync({rootDir})` over a temp corpus) so the consumer is measured against what actually reaches it. The repaired test also asserts `!Object.hasOwn(backlog, 'picked-up')` — if the producer ever grows that key, the mapping must change with it, and the test says so rather than silently passing again.

- Applies beyond memory categories: any roster with more than one reader — hook names, skill slugs, MCP servers, workflow tracks.
- Related: [[shipped-file-pristine-is-byte-identity-not-a-heuristic-c8a7]], [[a-verdict-must-distinguish-checked-from-nothing-to-compare]].
