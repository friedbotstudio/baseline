---
key: The right-size window is decoupled from simplify.min_files
category: decisions
scope: [tdd, simplify]
status: active
source: assistant-decision
raised-on: 2026-08-20
raised-in-context: cycle-time-fixes
verified-at: 2909d59
last-touched: 2026-08-20
governs: .claude/skills/harness/rightsize-gate.mjs
---

- `configFromProject` read `project.simplify.min_files ?? 4` as the right-size
  gate's file-count ceiling. It now reads `velocity.rightsize.min_files ?? 8` and
  never falls back to the simplify key.
- The two numbers answer opposite questions. `simplify.min_files` decides whether a
  diff is big enough to DESERVE a cleanup pass; the right-size window decides
  whether a diff is small enough for that pass to be SKIPPED. Reading one as the
  other's default pinned the gate to whatever a project had tuned simplify to —
  this repo sat at 4 files because `project.json` sets `simplify.min_files: 4`.
- `velocity.rightsize.max_lines` was removed from both `.claude/project.json` and
  `src/project.template.json` rather than raised to 200, so the window lives at
  exactly one place in the tree (the two constants in `rightsize-gate.mjs`). The
  audit's config-parity check binds those two files together; changing one without
  the other fails the build.
- Measured basis: over the last 120 commits, 23 diffs fit 4 files / 80 lines and 35
  fit 8 / 200. The gate may skip only `simplify` and `document`, so the widening is
  worth roughly a minute per run. It was landed because it is nearly free, not
  because it closes the cycle-time gap — that gap is in the post-approval
  implementation span.
- seed.md's envelope for this gate is unchanged: skip set still a subset of
  {simplify, document}, `security` still never auto-skipped, still fail-open.
