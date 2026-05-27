#!/usr/bin/env node
// Memory Stop — Stop event
//
// Parses the payload in-process and delegates the transcript walk + candidate
// extraction to lib/memory_stop.mjs (ported from the legacy .py / .sh heredoc).
// Also refreshes the continuity snapshot via lib/resume_writer.mjs.
//
// This hook is a PASSIVE COLLECTOR. It never writes to canonical memory
// files — only to the gitignored body of _pending.md. Best-effort: a
// transcript-walk failure never fails the hook.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAUDE_DOTDIR,
  CLAUDE_PROJECT_ROOT,
  readPayload,
  payloadGet,
  logLine,
} from './lib/common.mjs';
import { runMemoryStop } from './lib/memory_stop.mjs';
import { writeSnapshot } from './lib/resume_writer.mjs';

const payload = await readPayload();

const transcript = payloadGet(payload, '.transcript_path');
if (!transcript || !existsSync(transcript)) process.exit(0);

const memDir = join(CLAUDE_DOTDIR, 'memory');
const pending = join(memDir, '_pending.md');
if (!existsSync(pending)) process.exit(0);

try {
  runMemoryStop({ transcript, pending, projectRoot: CLAUDE_PROJECT_ROOT });
} catch (e) {
  process.stderr.write(`memory_stop: walker threw: ${e.message}\n`);
}

logLine('memory_stop', 'ran end-of-turn extraction');

// Refresh the continuity snapshot. Best-effort; never fail the hook.
try { writeSnapshot({ transcript, projectDir: CLAUDE_PROJECT_ROOT, trigger: 'stop' }); }
catch {}

process.exit(0);
