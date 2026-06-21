#!/usr/bin/env node
// Phase Timer — PostToolUse(Write|Edit|MultiEdit + Bash)
//
// Observation-only. Stamps a completion record for every phase newly present in
// workflow.json → completed[], carrying cumulative token totals read from the
// session transcript (.transcript_path). Two trigger legs:
//   - Write|Edit|MultiEdit whose edited file is .claude/state/workflow.json.
//   - Bash — the harness sometimes mutates workflow.json via a redirect / node-fs /
//     jq, which carries no file_path and never trips the edit leg. stampFromWorkflow
//     is idempotent and returns before the transcript read when completed[] is
//     unchanged, so an unconditional attempt on every Bash call is cheap.
// Any other tool is a no-op. It never blocks a tool call and never touches the
// edited file — PostToolUse cannot deny, and this hook writes only to the timing
// JSONL.
//
// Enforces CLAUDE.md Article (velocity Lever 0 / phase-timing-instrumentation).

import { basename } from 'node:path';
import { readPayload, payloadGet, CLAUDE_PROJECT_ROOT } from './lib/common.mjs';
import { stampFromWorkflow } from './lib/timing.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
const isEdit = ['Write', 'Edit', 'MultiEdit'].includes(tool);
const isBash = tool === 'Bash';
if (!isEdit && !isBash) process.exit(0);

if (isEdit) {
  const file = payloadGet(payload, '.tool_input.file_path');
  if (!file || basename(file) !== 'workflow.json') process.exit(0);
}

const transcriptPath = payloadGet(payload, '.transcript_path');

try {
  stampFromWorkflow({ rootDir: CLAUDE_PROJECT_ROOT, transcriptPath });
} catch {
  // Timing is best-effort; a stamp failure must never disturb the workflow.
}
process.exit(0);
