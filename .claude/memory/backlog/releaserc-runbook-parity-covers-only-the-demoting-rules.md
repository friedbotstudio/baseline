---
key: releaserc-runbook-parity-covers-only-the-demoting-rules
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-25
raised-in-context: release-safety-2026-08-25
verified-at: 290a41b
last-touched: 2026-08-25
governs: tests/releaserc-runbook-parity.test.mjs,.releaserc.json,docs/runbooks/npm-publish.md
---

> The parity test compares the breaking rule and the demoted scopes. It never reads the two rules that **promote**, so the runbook contradicted the release config in two more places and the suite stayed green.

- **The work.** Extend `demotedScopes`/`BUMP_EXPECTATIONS` to assert every `releaseRules` entry both ways, promotions included, so a rule the runbook does not document fails the same way a demotion does.
- **What was found (2026-08-25).** `{"type": "refactor", "release": "patch"}` and `{"scope": "constitution", "release": "minor"}` are both live and both used — 5 refactor commits and 2 constitution-scoped commits in history. The runbook listed `refactor:` under "no release" in two tables and never mentioned the `constitution` scope, so a `docs(constitution):` commit publishes where the page says nothing happens. Both were corrected by hand during the `/document` phase of the same workflow that built the test.
- **Why this is the same defect as T4.** The ticket that created this test existed because the runbook and the config had drifted silently. The test closes that for the rows it reads, and the rows it does not read drifted silently anyway.
- **Out of scope when found.** Widening the test was not approved scope for `release-safety-2026-08-25`; the prose was corrected and the assertion left as it was.
