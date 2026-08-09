---
key: roadmap-task-title-duplicates-body-e6ea
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: read-front-door-sweep
verified-at: 7f7b582
last-touched: 2026-08-09
governs: .claude/skills/roadmap/parse.mjs, .claude/skills/roadmap/cli.mjs
---

> One non-blocking observation for the backlog: `RoadmapTask.title` and `.body` come back identical — the full bullet text in both.

- **The defect.** `parseRoadmap` fills `title` and `body` with the same string: the entire task bullet, continuation lines included. Epic 6 T11 returns a ~700-character "title".
- **Why it matters.** AC-001 is satisfied as written — it requires the fields to be present, not to differ — so the tests pass. But the whole point of the batch was a JSON contract for a future operator GUI, and a 700-character title is unusable as a list label. Any consumer wanting a short label has to re-derive one, which is the parsing the CLI exists to remove.
- **The likely shape.** `title` = the first sentence or the text up to the first `.` after the task id; `body` = the remainder. Worth checking against the real plan first: several tasks open with a long clause before any period, so first-sentence may not be short enough on its own.
- **Not a cleanup.** It changes emitted data, so it needs an AC and a test, not a `/simplify` pass.
