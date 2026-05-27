#!/usr/bin/env node
// Lint Runner hook — PostToolUse(Edit|Write|MultiEdit)
//
// Runs the project-configured lint command against the changed file.
// Guide-mode behaviour matches test_runner: until `.claude/project.json` is
// configured, emits guidance rather than failing.

import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';
import {
  CLAUDE_PROJECT_ROOT,
  readPayload,
  payloadGet,
  projectGet,
  emitAllow,
  emitInfo,
  logLine,
} from './lib/common.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = relative(CLAUDE_PROJECT_ROOT, file) || file;

// Skip obviously non-code changes (same set as test_runner).
const skipExt = /\.(md|json|yaml|yml|toml|txt)$/i;
if (skipExt.test(rel) || rel.startsWith('docs/') || rel.startsWith('.claude/') || rel.startsWith('.config/')) emitAllow();

const configured = projectGet('.configured');
if (!(configured === true || configured === 'true' || configured === 'True')) {
  emitInfo('Lint Runner: .claude/project.json is not configured yet. Run `/init-project` to declare the lint command.');
  emitAllow();
}

const cmd = projectGet('.lint.cmd');
if (!cmd || cmd === 'None') {
  emitInfo(`Lint Runner: no .lint.cmd set in .claude/project.json. Skipping lint for '${rel}'.`);
  emitAllow();
}

let timeoutSec = projectGet('.lint.timeout_seconds');
if (typeof timeoutSec !== 'number' || !Number.isFinite(timeoutSec)) timeoutSec = 60;

const final = String(cmd).replaceAll('{file}', rel);

emitInfo(`Lint Runner: running \`${final}\` (timeout ${timeoutSec}s)`);
const proc = spawnSync('bash', ['-lc', final], {
  cwd: CLAUDE_PROJECT_ROOT,
  timeout: timeoutSec * 1000,
  encoding: 'utf8',
});
const rc = proc.status ?? (proc.error ? 124 : 0);
const out = ((proc.stdout || '') + (proc.stderr || '')).trim();
if (rc !== 0) {
  logLine('lint_runner', `FAIL rc=${rc} cmd=${final}`);
  emitInfo(`Lint Runner: FAILED (exit ${rc}) — output:`);
  emitInfo(out);
  process.exit(2);
}

logLine('lint_runner', `PASS cmd=${final}`);
emitAllow();
