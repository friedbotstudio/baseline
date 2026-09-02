---
key: .claude/skills/lib/epic-acs.mjs
category: landmarks
scope: [triage, tdd]
governs: .claude/skills/lib/epic-acs.mjs, .claude/skills/triage/retriage.mjs, .claude/skills/spec-lint/lint.mjs
verified-at: 02f3c68
last-touched: 2026-09-02
---

- Role: Foundation, 27 lines. The shared predicate for `slices[].acs` in an epic state file. Exports `isAcIdShape`, `offendingAcs`, `assertAcIdShape`, `AC_ID_RE` (`/^AC-\d+$/`).
- The rule it enforces: `slices[].acs` holds `AC-NNN` **ids**, never criterion prose. Published in `seed.md` §18.9.
- **Rejects, never repairs.** `assertAcIdShape` throws and the write does not proceed; nothing normalizes a prose value into a different shape. A repaired value would silently name different criteria.
- Asserted at the write in `retriage.mjs → materializeRetriagedEpic`, so a malformed epic state file is never created. Verified: nothing is written when the assertion fires.
- Four live epic state files were prose-shaped when this landed. The decision was to publish the rule and check new writes rather than migrate them, so `spec-lint` reports one named `epic-state-schema` FAIL row for those rather than one bogus "assigned to no slice" row per sentence.
