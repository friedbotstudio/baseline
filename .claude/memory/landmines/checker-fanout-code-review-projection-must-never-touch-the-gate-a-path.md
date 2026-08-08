---
key: checker-fanout-code-review-projection-must-never-touch-the-gate-A-path
category: landmines
scope: [tdd, integrate]
verified-at: 32b83c2
last-touched: 2026-07-15
---

- Path: `.claude/skills/harness/checker-fanout.mjs` (`persistVerdict` — `dir = phase === 'code-review' ? 'checker-fanout-code' : 'checker-fanout'`) and the reader `.claude/hooks/spec_approval_guard.mjs:72`.
- Trap: the fan-out writes **two** verdict projections by phase. The **spec-review** phase writes the CANONICAL gate-A projection `.claude/state/checker-fanout/<slug>.json`, which `spec_approval_guard.mjs:72` reads to allow/deny the `/approve-spec` token. The **code-review** phase (integrate, D8a) writes a SEPARATE `.claude/state/checker-fanout-code/<slug>.json`. If a future edit "simplifies" `persistVerdict` to share one path, or a new code-review checker's BLOCKER lands in the gate-A file, a code-time finding would **silently block gate A** (or a spec-time verdict would be overwritten by a later code-review run) — a cross-file regression invisible in the fan-out's own tests. `persistVerdict` also `return`s BEFORE the durable-plan mirror on the code-review branch (the mirror rides gate-A only).
- Mitigation: keep the two projection dirs phase-separated; never route code-review output through the `checker-fanout/` dir. The parity is guarded by `tests/eof-checker-interface.test.mjs` (`test_when_code_review_fanout_runs_then_writes_parallel_projection` asserts the gate-A file is NOT written). When editing `persistVerdict`, run that test + `tests/spec-rollout-integration.test.mjs` (gate-A projection shape).
- Live 2026-07-15 (`enforcement-oracle-framework`, C2/D8a): the split was introduced deliberately so the code-review gate at integrate cannot regress the gate-A CLEAN/BLOCKED contract. Verified in the C4 `/security` review.
