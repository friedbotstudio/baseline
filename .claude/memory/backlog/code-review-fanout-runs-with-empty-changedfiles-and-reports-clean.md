---
key: code-review-fanout-runs-with-empty-changedfiles-and-reports-clean
category: backlog
scope: [integrate]
governs: .claude/skills/harness/checker-fanout.mjs
status: picked-up
raised-on: 2026-08-13
raised-in-context: skill-character-doctrine
source: assistant-deferral
deferred: risk
verified-at: e36bcb9
last-touched: 2026-08-13
superseded-at: 2026-08-14
---

> A quality gate whose input is assembled by prose instructions will eventually be run with no input. Inputs that decide a verdict belong in a helper, not in a SOP paragraph.

- `checker-fanout.mjs:64` reads `ctx.changedFiles || []`; `integrate/SKILL.md` step 3.5 delegates ctx assembly to main context; no helper anywhere builds `changedFiles`.
- Every archived `.claude/state/checker-fanout-code/*.json` reads `{"findings": [], "verdict": "CLEAN"}` — measured, not assumed. `code-structure` and `backlog-deferral` have never run against real input.
- Fix: ship the assembler as a helper, and make a measured-zero verdict distinguishable from a measured-nothing verdict.
- RCA: `docs/rca/2026-08-13-blind-code-review-fanout-and-census-literals.md` AI-03.
