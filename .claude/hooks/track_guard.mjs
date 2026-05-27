#!/usr/bin/env node
// Track Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Enforces workflow phase ordering at the Write boundary. Reads the active
// workflow from .claude/state/workflow.json (written by /triage). When Claude
// tries to create/edit an artifact for phase N, all prior phases up to N-1
// must either have their artifact present or be listed in `exceptions`.
//
// Phase order + artifact globs come from .workflow.phases / .workflow.artifacts
// in .claude/project.json.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  CLAUDE_PROJECT_ROOT,
  STATE_DIR,
  readPayload,
  payloadGet,
  projectGet,
  emitAllow,
  emitBlock,
} from './lib/common.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = relative(CLAUDE_PROJECT_ROOT, file) || file;

const workflowState = join(STATE_DIR, 'workflow.json');
if (!existsSync(workflowState)) emitAllow();

let ws;
try { ws = JSON.parse(readFileSync(workflowState, 'utf8')); } catch { emitAllow(); }

const phases = projectGet('.workflow.phases');
const artifacts = projectGet('.workflow.artifacts');
if (!Array.isArray(phases) || phases.length === 0) emitAllow();
const artifactsMap = (artifacts && typeof artifacts === 'object') ? artifacts : {};
const exceptions = new Set(ws.exceptions || []);
const completed = new Set(ws.completed || []);

// Post-§18: workflow.json carries `track_id`; legacy pre-§18 files carry
// `entry_phase`. Accept both via this map (mirrors workflow-migrator's).
const TRACK_ID_TO_ENTRY_PHASE = {
  'intake-full': 'intake',
  'spec-entry': 'spec',
  'tdd-quickfix': 'tdd',
  'chore': 'chore',
};
const entry = ws.entry_phase || TRACK_ID_TO_ENTRY_PHASE[ws.track_id];

function globMatch(path, pat) {
  if (!pat) return false;
  // Translate ** and * into a regex. ** matches across separators; * doesn't.
  let out = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '*') {
      if (pat[i + 1] === '*') { out += '.*'; i++; }
      else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if ('.+()|^$\\[]{}'.includes(c)) out += '\\' + c;
    else out += c;
  }
  return new RegExp('^' + out + '$').test(path);
}

// Find which phase this file belongs to.
let filePhase = null;
for (const ph of phases) {
  if (globMatch(rel, artifactsMap[ph])) { filePhase = ph; break; }
}
if (filePhase === null) emitAllow();

const fileIdx = phases.indexOf(filePhase);
const entryIdx = phases.indexOf(entry);
const startIdx = entryIdx >= 0 ? entryIdx : 0;

function existsForPhase(ph) {
  const pat = artifactsMap[ph];
  if (!pat) return completed.has(ph);
  // Walk repo looking for any path that matches `pat`. Skip noisy dirs.
  const SKIP_TOP = new Set(['.git', 'node_modules', '.config']);
  const stack = [CLAUDE_PROJECT_ROOT];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      const abs = join(dir, name);
      const relAbs = relative(CLAUDE_PROJECT_ROOT, abs);
      if (relAbs === '') continue;
      const top = relAbs.split('/')[0];
      // .claude is allowed for review (review artifacts live under .claude/state/)
      if (SKIP_TOP.has(top)) continue;
      if (top === '.claude' && ph !== 'review') continue;
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) { stack.push(abs); continue; }
      if (globMatch(relAbs, pat)) return true;
    }
  }
  return false;
}

const missing = [];
for (let i = startIdx; i < fileIdx; i++) {
  const ph = phases[i];
  if (exceptions.has(ph)) continue;
  if (!existsForPhase(ph)) missing.push(ph);
}

if (missing.length === 0) emitAllow();

emitBlock(`Track Guard: cannot write '${rel}' (phase '${filePhase}') — prior phases not completed: ${missing.join(', ')}. Either produce those artifacts first, or inject exceptions via /triage.`);
