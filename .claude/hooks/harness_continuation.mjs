#!/usr/bin/env node
// Harness Continuation — Stop event
//
// Auto-continues multi-phase workflows across non-gated phase boundaries.
// Reads .claude/state/harness_state (written by the harness skill on every
// tick) and decides whether to re-fire harness on the same turn or stay silent.
//
// Gate has two disjunctive paths, both gated by rung 1:
//   Path A (mid-loop continuation):
//     1. stop_hook_active flag absent on payload.
//     2. .claude/state/.harness_active marker exists.
//     3. harness_state.state equals "continue".
//   Path B (rung 4 — gate-resume after a consent slash command):
//     1. stop_hook_active flag absent.
//     4a. harness_state.state equals "yielded".
//     4b. .claude/state/workflow.json exists and parses.
//     4c. at least one of {commit_consent, push_consent,
//         spec_approvals/<slug>.approval, swarm_approvals/<slug>.approval}
//         exists with mtime newer than harness_state's mtime.
//   If Path A or Path B passes, emit a block decision.
//
// Sanity rail: if marker slug != workflow.json slug, log WARN; decision unchanged.
// Internal failures treated as silence.

import { existsSync, readFileSync, statSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STATE_DIR,
  LOG_DIR,
  readPayload,
  payloadGet,
} from './lib/common.mjs';

const LOG_PATH = join(LOG_DIR, 'harness_continuation.log');

function logLog(level, message) {
  try {
    const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    appendFileSync(LOG_PATH, `${ts}  ${level}  ${message}\n`);
  } catch {}
}
const logInfo = (m) => logLog('INFO', m);
const logWarn = (m) => logLog('WARN', m);

function silent(msg) {
  logInfo(msg);
  process.exit(0);
}

const payload = await readPayload();

// Rung 1: stop_hook_active prevents recursive re-firing.
const stopActive = payloadGet(payload, '.stop_hook_active');
if (stopActive === true || stopActive === 'true' || stopActive === 'True' || stopActive === 'TRUE') {
  silent('silent: rung1 stop_hook_active=true');
}

const marker = join(STATE_DIR, '.harness_active');
const harnessStatePath = join(STATE_DIR, 'harness_state');

let stateMtime, data;
try {
  stateMtime = statSync(harnessStatePath).mtimeMs / 1000;
  data = JSON.parse(readFileSync(harnessStatePath, 'utf8'));
} catch (e) {
  silent(`silent: harness_state unparseable (${e.message})`);
}

const stateValue = data.state;

// Read workflow.json slug once.
const workflowPath = join(STATE_DIR, 'workflow.json');
function readWorkflowSlug() {
  if (!existsSync(workflowPath)) return null;
  try {
    const wf = JSON.parse(readFileSync(workflowPath, 'utf8'));
    return wf.slug || '';
  } catch { return null; }
}
const workflowSlug = readWorkflowSlug();

function anyConsentNewerThan(reference, slug) {
  const candidates = [
    join(STATE_DIR, 'commit_consent'),
    join(STATE_DIR, 'push_consent'),
  ];
  if (slug) {
    candidates.push(join(STATE_DIR, 'spec_approvals', `${slug}.approval`));
    candidates.push(join(STATE_DIR, 'swarm_approvals', `${slug}.approval`));
  }
  for (const p of candidates) {
    try {
      if ((statSync(p).mtimeMs / 1000) > reference) return true;
    } catch {}
  }
  return false;
}

let emitLogDetail = '';
if (stateValue === 'continue') {
  if (!existsSync(marker)) silent('silent: rung2 marker missing for Path A (state=continue)');
  emitLogDetail = 'Path A (state=continue + marker present)';
} else if (stateValue === 'yielded') {
  if (workflowSlug === null) silent('silent: rung4 workflow.json missing or unparseable');
  if (!anyConsentNewerThan(stateMtime, workflowSlug)) silent('silent: rung4 no consent token newer than harness_state');
  emitLogDetail = 'Path B (rung 4, state=yielded + fresh consent)';
} else {
  silent(`silent: state=${JSON.stringify(stateValue)} (not "continue" or "yielded")`);
}

// Sanity rail.
let markerSlug = '';
if (existsSync(marker)) {
  try { markerSlug = readFileSync(marker, 'utf8').trim(); } catch {}
}
const railWorkflowSlug = workflowSlug || '';
if (markerSlug && railWorkflowSlug && markerSlug !== railWorkflowSlug) {
  logWarn(`slug mismatch: marker=${markerSlug} workflow=${railWorkflowSlug}`);
}

const decision = {
  decision: 'block',
  reason: 'Workflow continuing per harness_state. Invoke Skill(harness) to advance to the next phase.',
};
process.stdout.write(JSON.stringify(decision) + '\n');
logInfo(`emit: decision=block (${emitLogDetail})`);
process.exit(0);
