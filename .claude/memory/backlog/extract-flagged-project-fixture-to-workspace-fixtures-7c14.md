---
key: extract-flagged-project-fixture-to-workspace-fixtures-7c14
category: backlog
scope: [scenario, simplify]
governs: tests/helpers/workspace-fixtures.mjs
status: open
raised-on: 2026-08-07
raised-in-context: system-spec-delta-slice-d (Phase 7 simplify)
source: assistant-deferral
estimated-effort: tiny (move one function, update two imports)
verified-at: 9235a23
last-touched: 2026-08-07
---

> Extracting it into `tests/helpers/workspace-fixtures.mjs` means editing a file outside this branch's diff — a follow-up, not cleanup.

**The same flagged-project fixture now exists in two test files under two names.** `makeFlaggedProject` at `tests/system-spec-delta-shard-writer.test.mjs:64` and `flaggedCorpus` at `tests/system-spec-delta-kind-backfill.test.mjs`. Both do the same three things: `makeProject()`, write a `.claude/project.json` carrying `memory.architecture_map.{enabled, governed_surface, witnesses}`, then `makeWorkspace(specDir)`.

**Why it was not fixed in place.** The `scenario` skill may not modify an existing test file, and `simplify` is scoped to the branch diff — slice B's suite is not in it. So neither phase that noticed it was permitted to fix it, which is exactly the shape that produces a third copy next time.

**Why it matters more than ordinary duplication.** `resolveGovernedSurface` REFUSES an absent surface by throwing, so every corpus test needs this fixture, and `makeProject()` deliberately writes no `project.json`. The next corpus test either imports one of the two copies across suite boundaries or rolls a third. `workspace-fixtures.mjs` already carries the sibling writers (`makeWorkspace`, `writeWorkspaceElement`, `makeConcepts`, `makeDiagrams`, `writeWorkspaceShard`) and its docblock states the EXTEND-rather-than-re-roll rule this violates.

**Fix.** Move it to `workspace-fixtures.mjs` as `makeFlaggedProject(state)` — keep slice B's name and its `'on' | 'off' | 'absent'` parameter, since AC-013 needs all three states and the newer copy only ever needs `'on'`. Update both suites to import it. Keep the narrow `roots: ['src/']` default: reusing the live roots would make `findGaps` depend on whatever else is on disk.

**Related.** [[a-corpus-fixture-must-write-an-element-before-a-readme]] and the fixture-ordering conventions in `.claude/skill-memory/scenario/MEMORY.md`, which already record this fixture's traps in prose but not in code.
