---
key: roadmap-file-order-buries-the-epics-sequenced-first-c542
category: backlog
scope: []
governs: docs/roadmap-execution-plan.md
status: open
source: assistant-deferral
deferred: human-directed
raised-on: 2026-08-28
raised-in-context: drift-check-slice-scoping
verified-at: b3f9dbb
last-touched: 2026-09-02
---

> "If you want the reader and the plan to agree, the fix is to move the four sections above Epic 8 in the file, since file order is the only ordering this tool has."

- **The drift.** Epics 14-17 carry the prose that names them the priority — Epic 14 says outright that it "is sequenced first because every other guarantee in the repo rests on a check being honest." They sit at `docs/roadmap-execution-plan.md:191-227`, below every ✅ epic in the file. Epics 8-13 above them are all closed.
- **Why file order is the whole of it.** `standup/gather.mjs` reads epic sections in file order and has no priority field to read instead. So the plan a reader is told to follow and the order the tool reports disagree, and the tool is the one people see at session start.
- **Not a format violation.** `auditRoadmap` returns zero anomalies over these sections and `syncRoadmap`'s heal pass finds nothing to repair — the heading grammar and the emoji tallies are all correct. Nothing mechanical catches this, which is why it needs an entry rather than a test.
- **Shape of the fix.** Move the four `## Epic 14-17` sections above `## Epic 8` in the file. That is a hand-edit of prose ordering, not a `roadmap-sync` operation: the skill flips emoji and heals headings, and deliberately never reorders sections. Renumbering is the thing to avoid — the `(tag)` slug is the dedupe key and `roadmap_epic` is stamped into epic state, so the numbers must not move even though the sections do.
- Reason `human-directed`: the ordering encodes what the maintainer intends to do next. Inferring it from the file would be exactly the guess `roadmap-sync` is built to refuse.
