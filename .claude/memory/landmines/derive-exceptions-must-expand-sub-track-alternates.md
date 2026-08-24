---
key: derive-exceptions-must-expand-sub-track-alternates
category: landmines
scope: [triage, tdd]
governs: .claude/skills/triage/derive-exceptions.mjs, .claude/workflows.jsonl
source: incident
verified-at: 05d8fec
last-touched: 2026-08-24
---

- Path: `.claude/skills/triage/derive-exceptions.mjs` → `deriveExceptions`, and any track in `.claude/workflows.jsonl` carrying a `type: selector` node.
- Trap: a selector node has no `metadata.phase` of its own. Its phases live in the `sub_track` its alternates name. Collecting only `trackNodes.map(n => n.metadata.phase)` therefore excepts a phase the track **can** actually reach, and `track_guard` then blocks the very write that phase exists to perform.
- Confirmed 2026-08-09: `intake-full` had shipped this way, excepting `tdd`, `swarm-plan` and `swarm-dispatch` even though all three reach it through the `implementation` selector. Benign there only by luck. Widening the selector to `tdd-quickfix` would have excepted `tdd` on a track where `tdd` is the *only* implementation phase.
- Mitigation: `deriveExceptions` takes an optional `{ subTracks }` Map and expands one level of alternates (`reachablePhases`). One level only, matching invariant I7 — a sub_track is never selectable, so it cannot nest another selector. The CLI path builds the Map from every track in the file.
- The general shape, and why it recurs: this module exists to stop a phase skill declaring a prereq its own track cannot satisfy. A selector introduces a **second** way for a phase to be reachable, so any future node type that indirects to another node's phases re-arms the same trap. Ask "can this node reach a phase without declaring `metadata.phase`?" before adding one.
