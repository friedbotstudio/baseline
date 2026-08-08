---
key: finish-the-dispatcher-sweep
category: backlog
scope: []
status: picked-up
source: assistant-deferral
raised-on: 2026-08-08
raised-in-context: skill-helper-cli-dispatchers
verified-at: b164ae7
last-touched: 2026-08-08
governs: .claude/skills/*/SKILL.md,.claude/skills/workspace/*.mjs,.claude/skills/power/*.mjs,.claude/skills/document/*.mjs,.claude/skills/commit-planner/*.mjs,.claude/skills/org-dispatch/*.mjs,.claude/skills/sprint-plan/*.mjs,.claude/skills/sprint-planner/*.mjs
superseded-at: 2026-08-08
---

> **The blocker.** AC-012 asserts no shipped `SKILL.md` retains an inline import. I enumerated all of them: **31 call sites**, 14 target skill directories, **12 covered** by the approved 4 dispatchers, **19 not covered**. Closing the gap is roughly triple the approved change.

- **What shipped.** Four dispatchers — `workspace` (9 subcommands), `memory-flush` (4), `system-reconcile` (1), `memory-index` (2) — over a shared `.claude/skills/lib/argv.mjs`. They cover 12 of the 31 inline-import call sites.
- **What remains, enumerated at the implement tick 2026-08-08.** ~7 more `workspace` subcommands (`delta`, `placement`, `digest`, `reconcile`, `annotations`, `sync`, `shards`) and ~8 dispatchers that do not exist (`power`, `document`, `harness`, `commit-planner`, `org-dispatch`, `sprint-plan`, `sprint-planner`, plus `hooks/lib/common`).
- **Why the remainder is harder than the first pass.** The shipped subcommands are read-only. Several of the remaining ones WRITE (`digest.stampElement`, `shards.writeDiagramShard`, `sync.proposeMap`, `delta.verifyAndApplyDelta`), so each needs the guard analysis the read path did not.
- **Why it was split rather than dropped.** The spec's Goal read "every skill-helper library", which its own Contracts table never delivered — it pinned four dispatchers. The ACs were narrowed to what is built, the gap recorded in the spec's `## Non-goals`, and the direction re-approved. Splitting was the human's call (option C of three offered).
- **The one deliberate survivor.** `docs/system/README.md` still teaches the inline form for `materialize`, annotated with the reason: it writes, and the dispatcher exposes reads. A test asserts that annotation is present, so deleting the explanation fails the suite.
- **Where to start.** `tests/cli-sop-citations.test.mjs` carries `COVERED_MODULES`; extending that list is what re-arms AC-012 against the newly covered sites.
