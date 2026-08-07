---
key: archive-ordering-test-keys-on-prose-mentions-4b7c
category: backlog
scope: [tdd, simplify]
source: assistant-deferral
status: open
raised-on: 2026-08-07
raised-in-context: archive-delta-ordering
verified-at: 6fdd6ee
last-touched: 2026-08-07
---

> the ordering test passes partly because of where 'archive.sh' is MENTIONED in prose, not only where the steps sit — I flagged that as brittle

- `test_when_archive_sop_is_read_then_delta_verification_precedes_the_move` in `tests/system-spec-delta-archive-verify.test.mjs` compares `text.indexOf('verifyAndApplyDelta')` against `text.indexOf('archive.sh')` in `.claude/skills/archive/SKILL.md`.
- **Why that is weaker than it looks.** `archive.sh` appears in prose before it appears as an invocation. Landing this fix took two RALPH iterations spent moving *mentions* rather than steps: Step 2's warning had to say "the archive script", and `verifyAndApplyDelta` had to be named in the Step 3 heading. Both edits improved the prose, but the test drove them for the wrong reason.
- **The failure mode it leaves open.** Re-add the literal `archive.sh` anywhere above Step 3 — a perfectly reasonable prose edit — and the test goes red while the step order is still correct. The inverse is worse: reword the Step 3 heading and the assertion can pass on a stale mention.
- **What a tighter assertion looks like.** Compare the two *invocation* sites rather than first-mention anywhere: the fenced `verifyAndApplyDelta(` call against the fenced `.claude/skills/archive/archive.sh <slug>` line. Both are unambiguous and neither moves for prose reasons.
- Scope is one test body; no source change. Fold into the next workflow that touches this suite rather than running it alone.
- Governs the fix recorded in [[archive-step-5-reads-the-spec-after-step-3-has-moved-it]].
