#!/usr/bin/env node
// Test Runner hook — PostToolUse(Edit|Write|MultiEdit)
//
// Runs the project-configured test command against the changed file's
// affected tests. Guide hook: until `.claude/project.json` declares
// `test.cmd`, it emits guidance pointing at `/init-project` rather than
// failing. Once configured, it executes the command and surfaces failures
// as stderr info (PostToolUse cannot block the edit that already happened,
// but it surfaces test failures immediately so Claude reacts).

import { existsSync, accessSync, constants as fsc } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
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

// Skip obviously non-code changes.
const skipExt = /\.(md|json|yaml|yml|toml|txt)$/i;
if (skipExt.test(rel) || rel.startsWith('docs/') || rel.startsWith('.claude/') || rel.startsWith('.config/')) emitAllow();

const configured = projectGet('.configured');
if (!(configured === true || configured === 'true' || configured === 'True')) {
  emitInfo(`Test Runner: .claude/project.json is not configured yet. Run \`/init-project\` to declare the test command for this repo. (Skipping test run for '${rel}'.)`);
  emitAllow();
}

const cmd = projectGet('.test.cmd');
if (!cmd || cmd === 'None') {
  emitInfo(`Test Runner: no .test.cmd set in .claude/project.json. Skipping tests for '${rel}'.`);
  emitAllow();
}

// Resolve affected tests via configured resolver, if any.
let affected = '';
const resolver = projectGet('.test.affected_resolver');
if (resolver && resolver !== 'None') {
  const resolverAbs = join(CLAUDE_PROJECT_ROOT, resolver);
  let executable = false;
  try { accessSync(resolverAbs, fsc.X_OK); executable = true; } catch {}
  if (executable) {
    const r = spawnSync(resolverAbs, [rel], { encoding: 'utf8' });
    if (r.status === 0) affected = (r.stdout || '').trim();
  } else {
    emitInfo(`Test Runner: affected_resolver '${resolver}' not found or not executable.`);
  }
}

let timeoutSec = projectGet('.test.timeout_seconds');
if (typeof timeoutSec !== 'number' || !Number.isFinite(timeoutSec)) timeoutSec = 120;

let final = String(cmd).replaceAll('{file}', rel).replaceAll('{affected}', affected);

emitInfo(`Test Runner: running \`${final}\` (timeout ${timeoutSec}s)`);
const proc = spawnSync('bash', ['-lc', final], {
  cwd: CLAUDE_PROJECT_ROOT,
  timeout: timeoutSec * 1000,
  encoding: 'utf8',
});
const rc = proc.status ?? (proc.error ? 124 : 0);
const out = ((proc.stdout || '') + (proc.stderr || '')).trim();
if (rc !== 0) {
  logLine('test_runner', `FAIL rc=${rc} cmd=${final}`);
  emitInfo(`Test Runner: FAILED (exit ${rc}) — output:`);
  emitInfo(out);
  process.exit(2);
}

logLine('test_runner', `PASS cmd=${final}`);
emitAllow();
