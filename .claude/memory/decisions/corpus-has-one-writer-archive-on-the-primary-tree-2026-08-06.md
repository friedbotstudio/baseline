---
key: corpus-has-one-writer-archive-on-the-primary-tree-2026-08-06
category: decisions
scope: [archive, tdd, spec]
governs: .claude/skills/archive/SKILL.md,.claude/skills/workspace/contribute.mjs,.claude/hooks/swarm_boundary_guard.mjs,docs/system/**
source: assistant-deferral adopted in the approved plan; gate-A approved 2026-08-06 as ticket E of `docs/specs/central-system-spec.md`.
verified-at: d4e6216
last-touched: 2026-08-06
---

> My recommendation in the plan is one writer — all corpus writes route through `/archive` on the primary tree — which sidesteps wave races entirely rather than solving them.

- **Decision.** The central system spec at `docs/system/` has exactly one writer during a workflow: `/archive` Step 5, running on the primary tree. Swarm workers do not write the corpus, and `docs/system/**` is deliberately **not** added to a worker's `write_set`.
- **Rationale.** The alternative was making `docs/system/**` reachable from a worker `write_set` and relying on `swarm_boundary_guard` plus textual merge to keep parallel waves from colliding. That solves a race by managing it. Routing every corpus write through a single post-wave phase means the race cannot occur: waves finish, then one writer folds the result in. It also matches what the fold-back actually needs, which is the completed diff, not per-wave fragments.
- **What this does NOT claim.** It is not a statement that concurrent corpus writes are unsafe in general. File-per-record with no on-disk aggregate index makes textual git merge correct across *branches*, and ticket F documented that as the merge story. This decision is narrower: within one workflow, don't create the concurrency in the first place.
- **Re-verification.** If a future cycle adds `docs/system/**` to any swarm worker `write_set`, or wires a corpus write into a phase that runs inside a wave, this decision is void and the wave-race analysis has to be done for real. Check `swarm_boundary_guard` behaviour and the `write_set` in `.claude/state/swarm/<slug>.json` before assuming it still holds.
- **Related.** [[staleness-detection-is-mechanical-but-re-stamping-is-curation-4b18]] constrains *what* that one writer may do: it re-stamps only elements whose anchors the landed diff touched, and never bulk-refreshes.
