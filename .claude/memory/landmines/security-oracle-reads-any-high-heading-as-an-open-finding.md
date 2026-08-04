---
key: security-oracle-reads-any-high-heading-as-an-open-finding
category: landmines
scope: [security, integrate]
governs: .claude/skills/security/**,.claude/skills/harness/checker-fanout.mjs
verified-at: f7da5a7
last-touched: 2026-08-04
---

- `.claude/skills/security/oracle.mjs:12` matches `/^###\s+\[(CRITICAL|HIGH)\]\s+(.+)$/gim` and emits a BLOCKER per hit. It has **no notion of a fixed finding**. The report format the `security` skill prescribes has no "resolved" convention either.
- Consequence: a HIGH found AND fixed inside the same cycle still blocks `integrate`'s code-review fan-out, permanently, every time that report is read. Hit 2026-08-04 on `living-system-model-abcd` F-6.
- Recording a resolved finding under `### [HIGH]` is therefore a factual mis-statement, not just a formatting choice — that heading means "open" to the only mechanical reader of the file.
- Convention adopted for resolved-in-cycle findings: a `## Resolved in-cycle` section, headings of the form `### F-6 (HIGH — RESOLVED in-cycle) — <title>`, severity spelled out rather than bracketed. Evidence, impact, fix and test reference stay verbatim; only the heading form changes.
- **Do not reach for this to silence an OPEN finding.** The distinction is whether a regression test exists proving the fix. Without one, the bracketed heading is correct and the block is doing its job.
- Also check the report's `## Summary` when a ticket is added mid-cycle: F-6 left the summary still claiming "no CRITICAL or HIGH findings", which contradicted the addendum until corrected.
