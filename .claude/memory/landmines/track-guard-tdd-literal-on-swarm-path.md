---
key: track-guard-tdd-literal-on-swarm-path
category: landmines
scope: [tdd, integrate]
verified-at: 3c74ba8
last-touched: 2026-06-20
superseded-at: 2026-08-14
---

- Path: `.claude/hooks/track_guard.sh` (literal-match logic)
- Trap: when Phase 6 is satisfied via the swarm path (`swarm-plan` + `approve-swarm` + `swarm-dispatch` in `workflow.json → completed`), the track guard still refuses Phase 7+ artifact writes because it expects literal `"tdd"` in `completed`. First write attempt to `docs/security/<slug>-<date>.md` after a swarm dispatch fails with "phase 'security': prior phases not completed: tdd".
- Mitigation: after swarm-dispatch finishes, manually add `"tdd"` to `workflow.json → completed` with a rationale in a `completed_notes` field (e.g., `{"tdd": "satisfied via swarm path; track_guard literal-match workaround per seed.md §16 retrospective"}`). Documented in seed.md §16 deviation log too.
- Real fix (deferred): teach track_guard to accept `(swarm-plan + swarm-dispatch)` as Phase-6 satisfaction equivalent to `tdd`.
