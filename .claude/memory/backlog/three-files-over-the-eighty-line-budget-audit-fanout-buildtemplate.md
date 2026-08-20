---
key: three-files-over-the-eighty-line-budget-audit-fanout-buildtemplate
category: backlog
scope: [simplify]
governs: .claude/skills/harness/checker-fanout.mjs
status: open
raised-on: 2026-08-13
raised-in-context: skill-character-doctrine
source: assistant-deferral
deferred: dependency
verified-at: 2367f5e
last-touched: 2026-08-20
---

> They are simply the first output the check has ever produced.

- `audit-baseline/audit.mjs` 91, `harness/checker-fanout.mjs` 138, `scripts/build-template.sh` 145 substantive lines against an 80-line budget.
- All three were already over before `skill-character-doctrine` touched them (90, 136, 142 at HEAD); that workflow added 1, 2 and 3 lines.
- Meaningful only after [[code-review-fanout-runs-with-empty-changedfiles-and-reports-clean]] — before that the check reports nothing. RCA AI-06.
- **Precondition satisfied 2026-08-20.** `changedfiles-shape-contract` gave the oracle real input; `checker-fanout.mjs` now produces a live `file_length` finding at 149 substantive lines (was 138 when this was raised).
- **It no longer blocks.** D2 rates length already present at HEAD as ADVISORY, and `/simplify` declares it with the `inherited:` prefix, so the debt is named on every touch and freezes nothing. Splitting these three files is now a choice rather than a prerequisite.
