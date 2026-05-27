#!/usr/bin/env node
// Memory PreCompact — PreCompact event
//
// Fires before context compaction (manual /compact or auto). The full
// transcript is still on disk at this point; walks it and writes a
// continuity snapshot to .claude/memory/_resume.md via the JS resume
// writer. The next SessionStart (source: compact) re-injects that
// snapshot so the model knows where it left off.
//
// This hook NEVER blocks compaction. Snapshotting must be best-effort:
// a transcript-walk failure should not punish the user.
//
// Per docs: PreCompact stdout is NOT injected into context (only logged).
// So all useful output goes to disk; this hook prints nothing on stdout.

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAUDE_DOTDIR,
  CLAUDE_PROJECT_ROOT,
  readPayload,
  payloadGet,
  logLine,
} from './lib/common.mjs';
import { writeSnapshot } from './lib/resume_writer.mjs';

const payload = await readPayload();

const transcript = payloadGet(payload, '.transcript_path');
const trigger = payloadGet(payload, '.trigger') || 'auto';

if (!transcript || !existsSync(transcript)) {
  logLine('memory_pre_compact', `no transcript path; skipped (trigger=${trigger})`);
  process.exit(0);
}

const memDir = join(CLAUDE_DOTDIR, 'memory');
try {
  if (!statSync(memDir).isDirectory()) throw new Error('not a dir');
} catch {
  logLine('memory_pre_compact', 'memory dir missing; skipped');
  process.exit(0);
}

try { writeSnapshot({ transcript, projectDir: CLAUDE_PROJECT_ROOT, trigger: 'pre-compact' }); }
catch (e) { process.stderr.write(`memory_pre_compact: ${e.message}\n`); }

logLine('memory_pre_compact', `wrote _resume.md (trigger=${trigger})`);
process.exit(0);
