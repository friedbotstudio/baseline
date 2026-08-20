---
key: 1. `ctx.changedFiles` has two readers that disagree on its shape
category: backlog
scope: []
status: picked-up
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: dispatcher-sweep
verified-at: dd0e5d2
last-touched: 2026-08-09
governs: .claude/skills/code-structure/oracle.mjs, .claude/skills/harness/checkers/mutation-score.mjs, .claude/skills/harness/checker-fanout.mjs
superseded-at: 2026-08-20
---

- **The defect.** `code-structure/oracle.mjs → runCodeStructureOracle` reads
  `{path, content}` objects (`substantiveLineCount(file.content)`,
  `file.path`). `harness/checkers/mutation-score.mjs:36 → resolveMutationTarget`
  reads plain path **strings** (`/\.(mjs|js)$/.test(f)`, `f.startsWith('tests/')`).
  Both consume the same `ctx.changedFiles` from the same `runCheckerFanout`
  call at the `integrate` code-review boundary.
- **The consequence.** Passing strings makes the code-structure checker
  **silently vacuous**: `file.content` is `undefined`, `substantiveLineCount`
  returns 0, 0 is never `> 80`, and the checker returns `{findings: []}`. There
  is no error and no skip marker — the merged verdict reads `CLEAN` exactly as it
  would from a genuine pass.
- **Measured.** All 37 records under `.claude/state/checker-fanout-code/` at
  `dd0e5d2` carry `"findings": []` / `"verdict": "CLEAN"`, across workflows that
  changed large `.mjs` modules. `dispatcher-sweep` passed objects and the checker
  produced a real BLOCKER on its first run (`lib/argv.mjs`, 83 substantive lines
  against the 80 budget), which is what forced the `lib/output.mjs` split in
  `dd0e5d2`. The checker works; it had not been fed.
- **What to decide, not just fix.** Picking one shape is the easy half. The
  harder half is that `integrate/SKILL.md` Step 3.5 says only "assemble
  `ctx = {slug, rootDir, diffContent, changedFiles, securityReport,
  simplifyTable}`" and never states the element type, so main context guesses per
  run. Whichever shape wins, the SOP has to name it and a test has to hold it —
  otherwise this regresses the next time a checker is added.
- **Note on scope.** `runCodeStructureOracle` measures **whole-file** length, so
  feeding it objects makes a workflow that appends ten lines to a pre-existing
  285-line module inherit that module's debt as a BLOCKER. Decide whether the
  budget is a property of the file or of the change before turning the checker on
  for real.
