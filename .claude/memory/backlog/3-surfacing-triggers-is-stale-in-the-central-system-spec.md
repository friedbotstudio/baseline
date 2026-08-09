---
key: 3. `surfacing-triggers` is stale in the central system spec
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: dispatcher-sweep
verified-at: dd0e5d2
last-touched: 2026-08-09
governs: .claude/skills/harness/checker-fanout.mjs, .claude/skills/harness/checkers/mutation-score.mjs, .claude/skills/code-structure/oracle.mjs, .claude/skills/integrate/SKILL.md, docs/system/elements/surfacing-triggers.md
---

- `system-reconcile report` at `dd0e5d2`: *"kind sequence binds a test witness but
  the shard names none."* Untouched by `dispatcher-sweep`, so it was not
  re-stamped — `/memory-sync` Step 0e re-stamps only elements the curator has
  actually read against the code at the anchor.
- It resurfaces at every flush until someone names the witnessing test in the
  shard. That is the designed behavior, not a bug in the sweep.
