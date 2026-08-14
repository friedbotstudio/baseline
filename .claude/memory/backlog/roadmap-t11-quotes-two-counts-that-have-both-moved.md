---
key: roadmap-t11-quotes-two-counts-that-have-both-moved
category: backlog
scope: []
status: picked-up
source: assistant-deferral
raised-on: 2026-08-13
verified-at: be0a351
last-touched: 2026-08-13
governs: docs/roadmap-execution-plan.md
superseded-at: 2026-08-14
---

> `docs/roadmap-execution-plan.md` Epic 6 T11 quotes two counts in its prose: the number of landmarks a test locks at `scope: [scout]`, and the number of facts scout surfaces. Both are copies of live state and both are wrong.

- **The work.** Make T11 stop quoting the numbers. Not "correct them" — a corrected number buys one workflow and then lies again.
- **The evidence for that framing, which this entry produced against itself.** Filed 2026-08-13 saying "correct both numbers", with the then-current measurements written into the body. Both were stale within the same session: the landmark count moved twice more and the surfaced count once, as ordinary memory writes landed. **The entry documenting count drift drifted, in the session that filed it.** That is the strongest available argument that the fix is deletion rather than correction.
- **Deliberately not recording the current values here.** A bare number in this body would decay exactly as T11's did. If you need them, measure: `grep -l '^scope: \[scout\]$' .claude/memory/landmarks/*.md | wc -l` and `surfaceScopedMemory('scout')`. As of 2026-08-13 they read 89 and 99, quoted only as a measurement-at-a-date and not as a fact this entry maintains.
- **The claim T11 makes still holds.** A test does lock the count, so the deferral cannot drift closed unnoticed. What is wrong is only the roadmap's third hand-maintained copy of a number two other places already own.
- **Why it is filed rather than fixed.** `/roadmap-sync` writes only through `syncRoadmap` and may not hand-edit the roadmap, so the phase that finds the drift is structurally barred from repairing it. Pick it up with T11 itself.
- Instance of [[anti-drift-tests-compare-against-the-live-oracle-b4d2]] in prose rather than in a test.
