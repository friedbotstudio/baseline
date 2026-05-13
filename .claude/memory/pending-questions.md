---
owners: [any phase]
category: cross-session open questions
size-cap: 500
key: Q-NNN
verifies-against: none
---

# Pending questions

Questions the current session couldn't resolve. Surfaced at next session start so context isn't lost across yields.

Each entry's stable key is auto-numbered `Q-NNN`.

---

## Q-001

- Question: Should phase skills automatically invoke `/memory-flush` at start, or only when the SessionStart hook surfaces a "K candidates pending" nag?
- Raised in: 2026-04-27 memory-system build.
- Blocker for: clean session-start UX vs. interrupting flow.
- Options considered: (a) auto-invoke if pending count > 0; (b) nag only, let user decide; (c) auto-invoke with a "skip" command.
- Verified-at: HEAD
- Last-touched: 2026-04-27

