---
key: drift-check-has-no-declared-exception-mechanism
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-25
raised-in-context: release-safety-2026-08-25
verified-at: 290a41b
last-touched: 2026-08-25
governs: .claude/skills/tdd/drift_check.mjs
---

> `drift_check.mjs` resolves an AC only by finding its id in an added diff line, and offers no way to declare that an AC is evidenced by something a diff cannot show.

- **The work.** Give the drift check a declared-exception path: a spec row that names the AC and the evidence, which the check reads and reports as a distinct weaker status rather than as unresolved.
- **What forced it (2026-08-25).** `release-safety-2026-08-25` AC-003 asserted that a standing guard stays **unedited**. Nothing is added to a diff when a file is deliberately left alone, so the AC was unresolvable by construction and the check yielded on it. The workaround was a prose subsection in the spec declaring the exception, which the check cannot read — a human has to.
- **Why it matters.** `drift_check` exit 1 is a hard yield with no auto-loop. An AC that can never resolve turns that yield into a step the operator learns to wave through, which is the failure mode the gate exists to prevent.
- **Related.** [[drift-check-resolves-an-ac-from-a-range-comment]] and [[drift-check-carries-six-concerns-and-a-test-only-export]] are the other two open items on this module; all three want the same read.
