---
key: .claude/hooks/state_write_guard.mjs
category: landmarks
load_bearing: true
scope: []
governs: .claude/hooks/state_write_guard.mjs, .claude/hooks/lib/state-write.mjs
verified-at: 0336688
last-touched: 2026-08-25
---

- Path: `.claude/hooks/state_write_guard.mjs`. The 27th hook, landed 2026-08-25. Denies a **subagent** write to `.claude/state/**` on both the Bash and the edit-tool boundary. Wired on `Bash` and on `Edit|Write|MultiEdit|NotebookEdit` — two `PreToolUse` matchers, still one event.
- Role: reads the payload, delegates to `decideStateWrite` in [[.claude/hooks/lib/state-write.mjs]], allows or blocks. The hook file itself holds no rule; the seam matches `branch_guard.decide` and `consent-decision.decideCommitConsent`.
- Why it exists: Article II puts decisions in main context, and workflow state is where a decision becomes durable. A subagent appending a phase to `completed` widens what `track_guard` authorizes next, which is a privilege path bounded only by the consent gates. **Six hooks already read `workflow.json`; none guarded a write to it.**
- **Subagent detection reads absence, not a null.** The harness sends `agent_id`/`agent_type` only inside a subagent — absent keys in the main session, captured from live payloads. Treating absence as main-session is also the safe direction: failing closed would deny every main-session state write and brick the workflow.
- **Both boundaries or neither.** Wiring only the file-editing tools leaves the shell open, and a redirect appends a phase to `completed` exactly as well as an Edit does. The Bash leg is target-anchored via `writesWorkflowStatePath` in [[.claude/hooks/lib/common.mjs]], so a subagent READING `workflow.json` passes — one that cannot read it cannot work.
- `swarm-worker` is the one sanctioned subagent and what it is sanctioned to write is code in its worktree. The guard scopes to `.claude/state/**` and nothing wider, which is what keeps those source writes working.
