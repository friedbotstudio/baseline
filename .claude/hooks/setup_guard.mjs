#!/usr/bin/env node
// Setup Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Advisory only. When `.claude/project.json` reports `configured: false`,
// emits a one-time-per-period info message reminding the user that the
// baseline is in project-agnostic mode. Does NOT block writes.
//
// Deduplication: prints only when the warn-marker file hasn't been touched
// in the last 600 s. Re-warns at start of each new session naturally.

import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  CLAUDE_PROJECT_ROOT,
  STATE_DIR,
  readPayload,
  payloadGet,
  projectGet,
  emitAllow,
  emitInfo,
  logLine,
} from './lib/common.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = relative(CLAUDE_PROJECT_ROOT, file) || file;

// Already configured → no-op.
const configured = projectGet('.configured');
if (configured === true || configured === 'true' || configured === 'True') emitAllow();

// Configured=false. One-time-per-period advisory.
const WARN_MARKER = join(STATE_DIR, 'setup_guard_last_warn');
const now = Math.floor(Date.now() / 1000);
let last = 0;
try { last = Math.floor(statSync(WARN_MARKER).mtimeMs / 1000); } catch {}
const since = now - last;

if (since >= 600 || last === 0) {
  emitInfo("Setup Guard (advisory): `.claude/project.json` reports configured=false. The baseline is running in project-agnostic mode — test_runner and lint_runner hooks are in guide mode and no stack-specific tailoring has been applied. Run `/init-project` to scout the codebase, invoke the recommender, and generate a tailored config. (This warning is rate-limited to once per 10 minutes.)");
  try { writeFileSync(WARN_MARKER, ''); } catch {}
}

logLine('setup_guard', `advisory pre-init write to ${rel} (warned=${since >= 600 || last === 0 ? 'yes' : 'no'})`);
emitAllow();
