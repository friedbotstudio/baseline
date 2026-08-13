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
verified-at: e36bcb9
last-touched: 2026-08-13
---

> They are simply the first output the check has ever produced.

- `audit-baseline/audit.mjs` 91, `harness/checker-fanout.mjs` 138, `scripts/build-template.sh` 145 substantive lines against an 80-line budget.
- All three were already over before `skill-character-doctrine` touched them (90, 136, 142 at HEAD); that workflow added 1, 2 and 3 lines.
- Meaningful only after [[code-review-fanout-runs-with-empty-changedfiles-and-reports-clean]] — before that the check reports nothing. RCA AI-06.
