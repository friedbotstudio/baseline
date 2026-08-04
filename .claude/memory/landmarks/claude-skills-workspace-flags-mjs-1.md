---
key: .claude/skills/workspace/flags.mjs:1
category: landmarks
scope: any
governs: .claude/skills/workspace/flags.mjs,.claude/skills/scout/SKILL.md,.claude/skills/code-structure/SKILL.md
rests_on: zero-runtime-dependencies
load_bearing: true
verified-at: 7f89385
last-touched: 2026-08-04
---

- Path: `.claude/skills/workspace/flags.mjs`. The two opt-in gates for the workspace corpus and its annotations (spec decision D5, `owner: engineer`).
- Role: `workspaceEnabled({rootDir})` and `annotationsEnabled({rootDir})`, both reading `memory.workspace.enabled` / `memory.annotations.enabled` from `.claude/project.json`.
- **Strictly `=== true`.** A string `"true"`, a `1`, an object — none of them opt a project in. A missing or malformed config resolves `false` rather than throwing, so a project that never opted in is never interrupted.
- Why the flags exist: seeding makes the corpus non-empty, and at that instant every `scout` run would switch from discovery to reconcile — for consumers too, with no opt-out. The flag makes it a deliberate per-project choice.
- **`projectGet` in `hooks/lib/common.mjs` was the reuse candidate and does not fit.** It caches against one module-level path, so it cannot answer for a caller-supplied `rootDir`, and widening it would defeat the cache for every hook reading config on the hot path. Checked and rejected with a reason, not skipped.
- **Consumers, and this is the load-bearing part:** `scout/SKILL.md` Method step 0 checks `workspaceEnabled` BEFORE invoking `reconcile.mjs`; `code-structure/SKILL.md` checks `annotationsEnabled` before the `load_bearing` placement gate. Both are asserted by wiring tests in `tests/workspace-flags.test.mjs`, teeth-proven by mutation — because this module first shipped as an orphan nothing called. See [[a-cycle-that-adds-a-gate-must-assert-the-consumer-calls-it]].
- Ships absent from `src/project.template.json`, so a consumer install reads `false` by absence. This repository sets `memory.workspace.enabled: true` as the declared canary.
