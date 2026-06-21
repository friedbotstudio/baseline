#!/usr/bin/env node
// Phase Timer — PostToolUse(Write|Edit|MultiEdit)
//
// Observation-only. When the edited file is .claude/state/workflow.json, stamp a
// completion record for every phase newly present in completed[], carrying
// cumulative token totals read from the session transcript (.transcript_path).
// For any other path it is a no-op. It never blocks a tool call and never touches
// the edited file — PostToolUse cannot deny, and this hook writes only to the
// timing JSONL.
//
// Enforces CLAUDE.md Article (velocity Lever 0 / phase-timing-instrumentation).

import { basename } from 'node:path';
import { readPayload, payloadGet, emitAllow, CLAUDE_PROJECT_ROOT } from './lib/common.mjs';
import { stampFromWorkflow } from './lib/timing.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file || basename(file) !== 'workflow.json') process.exit(0);

const transcriptPath = payloadGet(payload, '.transcript_path');

try {
  stampFromWorkflow({ rootDir: CLAUDE_PROJECT_ROOT, transcriptPath });
} catch {
  // Timing is best-effort; a stamp failure must never disturb the workflow.
}
process.exit(0);
