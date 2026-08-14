---
key: src/cli/workflows-validator-invariants.js:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Domain — Article IV invariants I1..I11. Each `check*` returns `[{invariant, track_id, node_id, message}, ...]`; empty = holds. I1 unique track_ids; I2 selectable→entry node; I3 skill XOR sub_track (selector exempt with non-empty alternates); I4 depends_on/blocks resolve; I5 DAG; I6 commit tracks include `/grant-commit` before commit; I7 needs_user→consent command; I8 every skill/sub_track/command resolves on disk; I9 can_parallel siblings share blockedBy; I10 selector alternates share downstream contract; I11 predicates use v1 vocabulary.
- Companion: `src/cli/workflows-validator.js:1`, `src/cli/workflows-validator-predicates.js:1`.
