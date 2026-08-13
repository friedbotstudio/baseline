---
key: comment-corpus-repair-deferred-under-enforce-on-touch
category: backlog
scope: [simplify, integrate]
governs: .claude/skills/code-structure/oracle.mjs
status: open
raised-on: 2026-08-13
raised-in-context: skill-character-doctrine
source: assistant-deferral
deferred: cost
verified-at: e36bcb9
last-touched: 2026-08-13
---

> Not repairing the existing comment corpus. If current baseline source exceeds the threshold, that repair is separate work, recorded per decision D-3.

- The `comment_ratio` check lands at 0.50 on the body-only ratio. Measured over 370 files, 11 exceed it, and `scripts/build-template.sh` is the worst body-comment offender at 1.19 measured live by the checker.
- Intake D-3 grandfathers them under enforce-on-touch, so each is repaired when a workflow next opens it.
- Reason `cost`: repairing 11 files across unrelated subsystems in one workflow would multiply the diff without improving the check.
