// Foundation — the decision behind state_write_guard, split out so it is
// testable without the hook's top-level payload read. Same seam as
// branch_guard.decide and consent-decision.decideCommitConsent.
//
// Article II says decisions live in main context, but nothing enforced it: six
// hooks READ workflow.json and none guarded a write to it. A subagent appending
// a phase to `completed` widens what track_guard authorizes next, which is a
// privilege path bounded only by the consent gates.

import { canonicalRel, writesWorkflowStatePath } from './common.mjs';

const STATE_PREFIX = '.claude/state/';

// The harness sends agent_id and agent_type only inside a subagent — absent
// keys, not nulls, in the main session (captured from live payloads). Reading
// absence as "main session" is therefore correct rather than lenient, and it is
// also the safe direction: if the harness ever stopped sending the field,
// failing closed would deny every main-session state write and brick the
// workflow.
function isSubagent(payload) {
  const id = payload?.agent_id;
  return typeof id === 'string' && id !== '';
}

// Two tool boundaries reach the same state. Wiring only the file-editing tools
// left the shell open, which is the whole privilege path this guard exists to
// close — a redirect appends a phase to `completed` as well as an Edit does.
//
// The Bash leg is target-anchored like the consent detector it shares machinery
// with: a READ passes. A subagent that cannot read workflow.json cannot work.
function writesWorkflowState(payload) {
  if (payload?.tool_name === 'Bash') {
    return writesWorkflowStatePath(payload?.tool_input?.command);
  }
  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== 'string' || filePath === '') return false;
  return canonicalRel(filePath).startsWith(STATE_PREFIX);
}

// swarm-worker is the one subagent Article II sanctions, and what it is
// sanctioned to write is CODE in its worktree. Workflow state is not on that
// list, so it is denied here like any other subagent — the guard scopes to
// `.claude/state/**` and nothing wider, which is what keeps its source writes
// working.
export function decideStateWrite(payload) {
  if (!isSubagent(payload) || !writesWorkflowState(payload)) return { allow: true };
  return {
    allow: false,
    reason:
      `State Write Guard: a subagent (agent_type=${JSON.stringify(payload?.agent_type ?? null)}) `
      + `may not write ${payload.tool_input.file_path ?? payload.tool_input.command}. `
      + 'Workflow state under .claude/state/ is written '
      + 'by main context only — CLAUDE.md Article II. Return the value to the caller and let it write.',
  };
}
