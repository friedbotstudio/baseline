---
key: drift-check-resolves-an-ac-from-a-range-comment
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-08
raised-in-context: skill-helper-cli-dispatchers
verified-at: 4cc46e0
last-touched: 2026-08-08
governs: .claude/skills/tdd/drift_check.mjs,.claude/skills/scenario/SKILL.md
---

> `drift_check.mjs` resolved AC-002 through AC-010 against a file-header comment reading `(AC-001..AC-010)` rather than each AC's own annotation. A range mention in one comment can therefore mark nine ACs resolved with no test behind eight of them.

- **The work.** Resolve an AC only on a literal, exact id match, or report a range-derived resolution as a distinct weaker status so the drift report is not read as per-AC evidence.
- **What was observed (2026-08-08).** The drift report for `skill-helper-cli-dispatchers` listed nine ACs as `resolved` citing the same evidence line: `+// Skill-helper CLI dispatchers — the nine workspace subcommands (AC-001..AC-010).` One header comment, nine resolutions.
- **Why it is easy to miss.** The underlying coverage was real that run — all 17 ACs carried per-test `// AC-0NN` annotations, verified by a separate count — so the gate was right for the wrong reason. A defect that only misfires when the work is already correct will not surface on its own.
- **Why it matters.** `drift_check` exit 1 is a hard yield with no auto-loop; it is the mechanism trusted to prove implementation matches the approved spec. An AC that resolves on a neighbour's range comment is an unearned green in the one check meant to catch unearned greens.
- **Related.** [[drift-check-resolves-acs-by-literal-mention-not-implementation]] already records that literal mention is not implementation; this is the narrower hole where even the mention is not the AC's own.
