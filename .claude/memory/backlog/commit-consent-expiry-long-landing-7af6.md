---
key: commit-consent-expiry-long-landing-7af6
category: backlog
scope: []
status: picked-up
raised-on: 2026-07-17
raised-in-context: memory-decision-point-redesign
source: assistant-deferral
estimated-effort: medium
verified-at: e8d1480
last-touched: 2026-07-17
superseded-at: 2026-07-25
---

> verbatim (assistant, 2026-07-17):
> "A very long landing can outlive the 900s consent, and /commit archiving workflow.json mid-landing drops the workflow-scoped binding to time-window mode. Worth a landmine + maybe a longer TTL or re-binding the token to the archived slug."

- Intent: Fix the consent-expiry rough edge that bit the `memory-decision-point-redesign` landing. Workflow-scoped `/grant-commit` consent is meant to cover a whole workflow's landing regardless of wall-clock, but `git_commit_guard` binds it to the live `.claude/state/workflow.json` slug — and `/commit` Step 1 **archives** `workflow.json` before the actual `git commit`. Once archived, the guard falls back to the classic 900s time-window; a landing that takes longer than 900s between grant and commit (here a ~54-minute write-side extension) then hits `consent expired`, forcing a second `/grant-commit`. Candidate fixes: (a) have `git_commit_guard` also honor a consent token whose slug matches the workflow slug in the just-archived bundle (`docs/archive/<date>/<slug>/workflow.json`); (b) raise `consent.commit_ttl_seconds` for workflow-scoped grants; or (c) resolve the workflow slug from the archived bundle when the live file is absent. Prefer (a)/(c) — a longer blanket TTL weakens the ad-hoc time-window guarantee. Relates to `.claude/hooks/lib/consent-decision.mjs` and the gate-C landing flow.
