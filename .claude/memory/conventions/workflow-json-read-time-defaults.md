---
key: workflow-json-read-time-defaults
category: conventions
scope: [scenario, implement, tdd]
source: code-pattern
convention: When extending `workflow.json` with a new optional field, implement read-time defaults via a **defaults helper** (`.claude/skills/<owner-skill>/workflow-defaults.mjs → withDefaults`) that every reader calls. The helper applies `?? false` (or the field's documented default) on missing fields and returns a NEW object (no mutation). Legacy `workflow.json` files lacking the field continue to work without a migration write — the defaults materialize at read time, not at on-disk migration time.
why: in-flight workflows on disk pre-date the new field. Forcing a migrator write on every reader is brittle (race conditions, partial writes, lockfile coordination). Read-time defaults keep the on-disk shape ungoverned at the cost of slightly more code per reader; the centralized helper keeps the per-reader cost ~3 lines.
applies-to: any future `workflow.json` schema additions. The pre-§18 → §18 migrator at `src/cli/workflow-migrator.js` is a different category (one-shot shape migration); the read-time defaults pattern is for additive optional fields.
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- how to apply: (1) add the helper at `.claude/skills/<owner>/workflow-defaults.mjs` with `export function withDefaults(workflowJson) { return { ...workflowJson, <new_field>: workflowJson?.<new_field> ?? <default> }; }`; (2) every skill that reads the field calls `withDefaults(JSON.parse(readFileSync(...)))` first; (3) test the default-applied path AND the explicit-true path AND the no-mutation invariant. AC-008 of brainstorm-and-codesign codifies this pattern.
