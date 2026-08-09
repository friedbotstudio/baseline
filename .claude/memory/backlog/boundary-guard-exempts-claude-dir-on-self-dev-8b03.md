---
key: boundary-guard-exempts-claude-dir-on-self-dev-8b03
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: read-front-door-sweep
verified-at: 7f7b582
last-touched: 2026-08-09
governs: .claude/hooks/swarm_boundary_guard.mjs, .claude/project.json
---

> The boundary guard does not enforce these write sets. `swarm.exempt_path_prefixes` contains `.claude/`, and the guard short-circuits to allow before it checks ownership.

- **The gap.** `swarm_boundary_guard.mjs:53-55` iterates `exempt_path_prefixes` and calls `emitAllow()` on the first prefix match — BEFORE the write_set ownership check further down. This project sets that list to include `.claude/`, so every write under `.claude/skills/**` is allowed without consulting which task owns the file.
- **Why it matters for this repo specifically.** Baseline self-development puts nearly the whole write surface under `.claude/skills/**`. In `read-front-door-sweep`, 17 of 19 source files were exempt; only `tests/**` and `docs/**` were actually enforced. Combined with `swarm.isolation: "shared"` (no worktrees), wave disjointness was the sole protection against cross-task collision and nothing mechanically enforced it.
- **Evidence the enforced half works.** The same guard correctly denied a mid-wave edit to `docs/specs/read-front-door-sweep.md`, because `docs/` is in `enforced_path_prefixes` and not exempt. The mechanism is sound; the configuration disarms it where this repo does its work.
- **Not a simple flag flip.** Removing `.claude/` from the exempt list would make every hook/state/config write during a wave subject to write_set membership, which would break far more than it protects. The likely shape is a narrower exemption (`.claude/state/`, `.claude/memory/`) that leaves `.claude/skills/**` enforced. That is a governance change and needs its own amendment path.
