---
key: rightsize-gate-counts-test-lines-and-never-fires-4b7e
category: backlog
scope: []
status: open
raised-on: 2026-07-20
raised-in-context: chore-archive-node
source: assistant-deferral
estimated-effort: small
verified-at: 40057f8
last-touched: 2026-07-20
---

> verbatim (assistant, 2026-07-20):
> "The fix is small: measure the non-test diff against the threshold, or weight test lines at zero. And the dirty-tree bug I recorded this morning is real but secondary — even clean, the gate fails."

- Intent: make `.claude/skills/harness/rightsize-gate.mjs` capable of firing. Two independent
  defects, both required:
  1. **Counts test lines.** The threshold (`velocity.rightsize.max_lines`, default 80) is meant
     to gauge change risk, but the measurement includes test and fixture lines. A 2-line
     behavior change with a 100-line test measures 129 and is treated as large. Under TDD
     discipline every change carries tests, so the gate is permanently over threshold.
     `project.json → tdd.test_globs` already classifies these paths — exclude them.
  2. **Measures the whole dirty tree.** Unrelated uncommitted files inflate the count. Scope
     the measurement to the workflow's own diff.
- Evidence it is inert: swept every `workflow.json` under `docs/archive/**` — **zero** record a
  `rightsize-gate` row in `auto_skipped[]`. Velocity Lever 2 has never skipped a phase since it
  shipped. Measured live twice: `timing-instrument-repair` (dirty tree, 267 lines / 5 files) and
  `chore-archive-node` (clean tree, 129 lines / 4 files) — both `keep` everything.
- Why it matters more than its size suggests: this is the ONLY mechanism besides `/triage`
  exceptions that can trim ceremony, and ceremony was measured at ~48% of output tokens. Two
  consecutive workflows in one session were flagged by the user as over-engineered for their
  diff; the gate should have caught both and structurally could not.
- Constraint when fixing: the gate is **additive-only** and **never skips `security`** (Art. IV,
  seed.md §5). Widening what it may skip is out of scope — the fix is to make its existing,
  correctly-bounded authority actually reachable.
- Detail: [[rightsize-gate-measures-whole-dirty-tree-not-workflow-diff]] (amended 2026-07-20 with
  the clean-tree evidence).
