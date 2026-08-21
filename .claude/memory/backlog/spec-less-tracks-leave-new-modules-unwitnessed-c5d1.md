---
key: spec-less-tracks-leave-new-modules-unwitnessed-c5d1
category: backlog
scope: [archive]
status: open
source: assistant-deferral
raised-on: 2026-08-21
raised-in-context: unsanitised-path-pair
verified-at: a163ec5
last-touched: 2026-08-21
governs: .claude/skills/workspace/delta.mjs, .claude/skills/archive/SKILL.md
deferred: risk
---

> No track without a spec has any path to witness a new element, and the clean report says nothing about it.

- **The defect.** `verifyAndApplyDelta` reads a spec's `## System delta` table to decide what to anchor into `docs/system/`. On a track where `spec` is an exception there is no spec, so it returns `specMissing: true` and every array empty.
- **Measured** on the `unsanitised-path-pair` `tdd-quickfix` run, 2026-08-21. Five governed-surface files were touched, two of them NEW modules: `.claude/skills/lib/terminal-text.mjs` (a Foundation module with two exports consumed by three call sites) and `.claude/skills/harness/ratio.mjs`. Neither appears anywhere under `docs/system/`.
- **The clean report is honest and insufficient.** `system-reconcile report` returns all seven sections at 0, which is true about the corpus's internal consistency and silent about two modules that never entered it.
- **The reporting side is already correct.** The archive SOP states that `specMissing: true` invalidates the other arrays rather than joining them, and `specMissing` exists for exactly this. The gap is upstream of the report.
- **Options.** A minimal delta declaration on spec-less tracks; an archive-time prompt when a NEW governed-surface file lands unanchored; or an explicit decision that spec-less tracks never extend the model.
