---
key: .claude/hooks/lib/state-write.mjs
category: landmarks
scope: []
governs: .claude/hooks/lib/state-write.mjs, .claude/hooks/state_write_guard.mjs
verified-at: 0336688
last-touched: 2026-08-25
---

- Path: `.claude/hooks/lib/state-write.mjs`. Exports `decideStateWrite(payload) -> {allow, reason?}`, the whole rule behind [[.claude/hooks/state_write_guard.mjs]].
- Two private predicates carry it. `isSubagent` tests a non-empty string `agent_id`. `writesWorkflowState` branches on `tool_name`: `Bash` delegates to `writesWorkflowStatePath` from [[.claude/hooks/lib/common.mjs]], everything else canonicalizes `file_path` and tests the `.claude/state/` prefix.
- Fail-open on everything ambiguous — a main-session write, a path outside the state directory, a degenerate payload. The hook's own `.catch(() => emitAllow())` is the second layer.
- The block reason names the Article and tells the subagent what to do instead: return the value to the caller and let main context write it. A guard that only says no costs a retry loop.
