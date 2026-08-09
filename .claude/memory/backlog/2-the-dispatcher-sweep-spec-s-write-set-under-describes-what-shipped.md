---
key: 2. The `dispatcher-sweep` spec's write set under-describes what shipped
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: dispatcher-sweep
verified-at: dd0e5d2
last-touched: 2026-08-09
governs: .claude/skills/spec/SKILL.md, .claude/skills/workspace/delta.mjs
---

- `.claude/skills/lib/output.mjs` was created during `integrate` (the fix for the
  BLOCKER in 1) and is **not** in the `**Write set**` line of the archived spec at
  `docs/archive/2026-08-08/dispatcher-sweep/spec.md`.
- Coverage was never at risk: element `skill-probe-lib` glob-anchors
  `.claude/skills/lib/*.mjs`, `workspace coverage` reported no uncovered governed
  path, and the archive delta check returned 0 unclaimed.
- Left unamended deliberately. The gate-A approval token hashes the spec, so
  editing it after approval re-opens the gate; the record was kept honest rather
  than tidy. Nothing to fix in code — this exists so a future reader of that
  bundle knows the omission was seen.
