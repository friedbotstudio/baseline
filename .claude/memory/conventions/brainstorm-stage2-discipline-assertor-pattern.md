---
key: brainstorm-stage2-discipline-assertor-pattern
category: conventions
scope: [scenario, implement, tdd]
source: code-pattern
convention: When a skill emits user-facing dialogue turns that must obey a structural rule (e.g., "no solution-shaped tokens"), implement the rule as a **discipline assertor**: a pure-function scanner that runs against every model-emitted text BEFORE emission. `.claude/skills/brainstorm/discipline.mjs → scanTurn(text)` is the canonical example: regex bank covering solution verbs (`implement`, `refactor`, `add X`), library names (Redis, PostgreSQL, etc.), and proposal phrasing (`we could`, `I recommend`). The scanner returns `violations[]`; the calling skill rewrites the turn until the array is empty. Tests assert the violation behavior with conforming + counter-example fixtures.
why: structural discipline is harder to drift than prose-only rules. The discipline assertor is a piece of code with a test; the alternative ("Stage 2 SHALL NOT propose solutions" as prose-only guidance) is unenforceable across drift.
applies-to: any new skill with multi-turn dialogue + a structural rule on emission content. The brainstorm Stage 2 discipline is the first instance; the pattern generalizes.
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- how to apply: when a new skill has a dialogue surface with a "shall not say X" rule, write the assertor as a Foundation-layer .mjs module beside the SKILL.md; reference it from the SKILL.md Stage description; add tests with both conforming and violating fixtures. The assertor is the structural enforcement; the SKILL.md prose is the documentation.
