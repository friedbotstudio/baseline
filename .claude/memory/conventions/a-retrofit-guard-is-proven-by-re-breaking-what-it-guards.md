---
key: a-retrofit-guard-is-proven-by-re-breaking-what-it-guards
category: conventions
scope: [scenario, implement, tdd, simplify, document]
source: assistant-deferral
raised-on: 2026-08-25
raised-in-context: release-safety-2026-08-25 follow-on
verified-at: 5f52ba2
last-touched: 2026-08-27
governs: tests/control-bytes.test.mjs
surfaces-on: tests/**
---

- Convention: when a test is written for a defect that has **already been fixed by hand**, it is green on its first run, and that green is evidence of nothing. Before keeping it, put the defect back, watch the test name it, then restore. A guard that has never failed has never been shown to be connected to anything.
- Why this is not covered by ordinary TDD. Inside `/tdd` the RED comes free, because the fix does not exist yet. This is the retrofit case: a correction made during `/document` or `/simplify`, or a check added after a review found something, where the code is already correct when the assertion is written. [[test-regression-trap-semantics]] classifies the three pre-implement states; this is the rule for the case where there is no pre-implement state to classify.
- **Measured 2026-08-25, four retrofit guards in one session.** Two runbook-parity assertions covering the promoting release rules were green on first run only because the prose had been corrected by hand an hour earlier. Removing `refactor:` from the bump table produced `refactor promotes to patch and no table row names it`; weakening the constitution row produced `its row says "yes"`. Both restored. The same inversion on the site-date guard and the GA4 hook guard behaved the same way.
- **It caught a real defect once out of four.** The GA4 rendered-hook test failed on first run, and the honest reading was a broken site. It was a broken regex: `data-copy` is written with single quotes on two pages because the copied command contains double quotes, and a double-quote-only reader called those buttons uninstrumented. Reading *which* pages the failure named, rather than trusting the failure, is what separated the two.
- The cost is two edits and one test run. The alternative is a suite that reports a number nobody can act on.
- Related: [[anti-drift-tests-compare-against-the-live-oracle-b4d2]] — that entry governs what a test compares against; this one governs whether the comparison was ever exercised.
