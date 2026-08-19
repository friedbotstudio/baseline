---
key: terminal-sanitizer-duplicated-across-standup-and-deferral-checker
category: backlog
scope: [implement, simplify]
governs: .claude/skills/harness/checkers/*.mjs
status: picked-up
raised-on: 2026-08-13
raised-in-context: skill-character-doctrine
source: assistant-deferral
deferred: cost
verified-at: e36bcb9
last-touched: 2026-08-13
superseded-at: 2026-08-19
---

> Extracting a shared module for two consumers is the premature abstraction code-structure's laziness ladder warns against — the third use is where it earns its place.

- The C0/C1-strip plus whitespace-collapse plus clip rule exists at `.claude/skills/standup/render.mjs` (`clip`, DETAIL_WIDTH 96) and `.claude/skills/harness/checkers/backlog-deferral.mjs` (`safe`, FIELD_WIDTH 96).
- On a third consumer, move the rule to `.claude/hooks/lib/` and repoint BOTH existing copies. A shared module with the old copies still in place is worse than either state alone.
- Relates to [[a-verdict-must-distinguish-checked-from-nothing-to-compare]].
