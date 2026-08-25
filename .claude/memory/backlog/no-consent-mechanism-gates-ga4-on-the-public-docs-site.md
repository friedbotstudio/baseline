---
key: no-consent-mechanism-gates-ga4-on-the-public-docs-site
category: backlog
scope: []
status: open
source: assistant-deferral
deferred: human-directed
raised-on: 2026-08-25
raised-in-context: docs-site analytics review
verified-at: 743c644
last-touched: 2026-08-25
governs: site-src/_layouts/base.njk,site-src/_data/analytics.js
---

> The site loads GA4 on every production page with no consent banner and no `gtag('consent', ...)` call. Measured 2026-08-25: neither exists anywhere in `base.njk` or `analytics.js`.

- **The work, if it is wanted.** Decide whether the public docs site needs a consent gate for EU visitors, and if so whether it is a banner plus GA4 Consent Mode or simply dropping the tag.
- **Why it is not filed as a defect.** This is a legal and product judgement about a site the project owner publishes, not a code fault. The instrumentation itself is correct: the loader fires once per page, the measurement id is public by design, and `GITHUB_RUN_ID` gating keeps every local build unmeasured.
- **What is measured today.** Page views on all 19 pages, plus two custom events (`copy_install_command`, `select_content`). No identifiers beyond what GA4 sets itself.
- `deferred: human-directed` — nobody has asked for this, and Claude should not add or remove a tracking gate on the owner's site unprompted.
