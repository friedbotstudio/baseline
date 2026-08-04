---
key: a-check-that-measured-nothing-reports-success
category: landmines
scope: [tdd, integrate, document, security]
governs: tests/**,.claude/skills/scenario/SKILL.md,.claude/skills/implement/SKILL.md
load_bearing: true
verified-at: 4888484
last-touched: 2026-08-04
---

- **The trap.** A verification step that measured nothing looks exactly like one that measured everything and passed. Silence and green are the same pixel. This is the operator-side twin of the false-clean *oracle* family ([[reader-level-grades-rendered-html-so-markdown-passes-vacuously]], [[drift-check-resolves-acs-by-literal-mention-not-implementation]], [[security-oracle-reads-any-high-heading-as-an-open-finding]]) — there a shipped tool misreads its input; here the check never ran at all.
- **Instance 1, a grep that matched nothing (2026-08-04, tracking-annotations).** Mutation-testing two wiring tests: mutate the producer, re-run, confirm red. The runner output was filtered with `grep -E "^\s+(not ok|ok) test_when_scout"`, but TAP emits `not ok 1 - test_when_scout...` — a number and ` - ` sit between the status and the name. The pattern matched zero lines, both mutations printed **nothing**, and an empty result read as "the mutations passed". Re-run with `(not ok|ok) [0-9]+ - ` the real answer appeared, and it was better than assumed: mutation 1 reddened both tests, mutation 2 reddened only the ordering test. **A mutation check that prints nothing has not passed.** Assert the baseline prints N lines before trusting that the mutated run prints N failures.
- **Instance 2, a test green for the wrong reason (same cycle).** When WIDENING a narrow lookup (a gate reading one memory category that must read all eight), a test seeded in a newly-admitted category passes against the OLD code: the entry is simply never found, so the assertion under test — `confirmed !== true` — never executes and the falsy result is right by accident. Both branches return the same shape, which is what hides it. Fix: assert on the *reason*, not the boolean (`assert.match(String(result.reason), /confirmation/i)`), which is RED pre-widening and still meaningful after.
- **Practical rule.** Before believing a check, prove it can fail. For a filter, confirm it matches on the known-good input first. For a test, confirm it is RED before the change for the reason you intend, not merely RED. "No output" is never evidence.
- Related, different actor: [[a-cycle-that-adds-a-gate-must-assert-the-consumer-calls-it]] is about a gate nothing calls; this is about a check that ran but measured nothing.
