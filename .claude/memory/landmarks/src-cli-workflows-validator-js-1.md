---
key: src/cli/workflows-validator.js:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Orchestration — top-level workflows.jsonl validator. Loads `.claude/workflows.jsonl`, parses each line, runs Article IV invariants I1..I11 via `workflows-validator-invariants.js`. Returns `{ ok, tracks | errors }`. Consumed by `triage/seed-tasklist.mjs` (validate + materialize modes), `audit-baseline/audit.mjs` (post-§18 hook), `commands/init-project-doctor.md`.
- Companion: `src/cli/workflows-validator-invariants.js:1`, `src/cli/workflows-validator-predicates.js:1`, `.claude/schemas/workflow-track.v1.json`.
