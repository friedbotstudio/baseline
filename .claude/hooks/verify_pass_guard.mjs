#!/usr/bin/env node
// Verify Pass Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Belt-and-braces backstop for the `verify` skill. Operates at the Write tool
// boundary: even if the skill's verdict is bypassed, Claude physically cannot
// persist a "PASS" line to a verification artifact when the most recent test
// output contradicts it.
//
// Triggers only when the target file is a verification artifact (paths under
// docs/verify/** or filename matches *verify* / *verification*), and the
// content being written contains a PASS line.
//
// Truth source: .claude/state/last_test_result (one line: PASS|FAIL).

import { existsSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import {
  CLAUDE_PROJECT_ROOT,
  STATE_DIR,
  readPayload,
  payloadGet,
  emitAllow,
  emitBlock,
  logLine,
} from './lib/common.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = relative(CLAUDE_PROJECT_ROOT, file) || file;

let isVerify = rel.startsWith('docs/verify/') || rel.startsWith('docs/verification/');
const base = basename(rel);
if (/verify|verification|VERIFY/.test(base)) isVerify = true;
if (!isVerify) emitAllow();

// Collect proposed content
let content = '';
if (tool === 'Write') content = payloadGet(payload, '.tool_input.content') || '';
else if (tool === 'Edit') content = payloadGet(payload, '.tool_input.new_string') || '';
else if (tool === 'MultiEdit') {
  const edits = payloadGet(payload, '.tool_input.edits') || [];
  content = edits.map((e) => e.new_string || '').join('\n');
}

// Look for a PASS claim.
const passClaim = content.split(/\r?\n/).some((ln) => {
  const s = ln.trim();
  if (/^PASS$/.test(s)) return true;
  if (/^(VERIFY|STATUS|RESULT|VERDICT)\s*[:=]\s*PASS\b/i.test(s)) return true;
  return false;
});
if (!passClaim) emitAllow();

// Check the truth source.
const truth = join(STATE_DIR, 'last_test_result');
if (!existsSync(truth)) {
  logLine('verify_pass_guard', `BLOCKED no truth source for PASS claim in ${rel}`);
  emitBlock('Verify Pass Guard: cannot persist a PASS line — no test evidence exists at .claude/state/last_test_result. Run the tests (or invoke the `verify` skill) to produce a verdict before claiming PASS.');
}

let verdict;
try { verdict = readFileSync(truth, 'utf8').split(/\r?\n/)[0].replace(/\s+/g, ''); } catch { verdict = ''; }
if (verdict !== 'PASS') {
  logLine('verify_pass_guard', `BLOCKED verdict=${verdict} claim=PASS file=${rel}`);
  emitBlock(`Verify Pass Guard: cannot persist a PASS line — the latest test verdict is '${verdict}' (see .claude/state/last_test_result). Fix the failing tests first; do not edit the verification artifact to claim PASS.`);
}

logLine('verify_pass_guard', `ALLOWED verdict=PASS file=${rel}`);
emitAllow();
