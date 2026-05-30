#!/usr/bin/env node
// Memory Session Start — SessionStart event
//
// At every session start: clean up stale .harness_active marker, then build
// the memory index + resume snapshot via lib/memory_session_start.mjs.
//
// Output: structured `additionalContext` JSON so Claude Code injects the
// index directly into the startup prompt. Kept under ~10KB total.

import { existsSync, mkdirSync, readFileSync, rmSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAUDE_PROJECT_ROOT,
  CLAUDE_DOTDIR,
  STATE_DIR,
  LOG_DIR,
  readPayload,
  payloadGet,
  projectGet,
  logLine,
} from './lib/common.mjs';
import { buildIndex } from './lib/memory_session_start.mjs';

const payload = await readPayload();

// Marker cleanup — remove stale .harness_active from a prior session.
// Cross-session ghost prevention: harness_continuation reads this marker as
// Rung 2; without cleanup, a leftover marker from a prior session would let
// yesterday's state:continue re-fire on today's first turn-end.
const marker = join(STATE_DIR, '.harness_active');
if (existsSync(marker)) {
  let markerSlug = '';
  try { markerSlug = readFileSync(marker, 'utf8').split(/\r?\n/)[0]; } catch {}
  try { rmSync(marker); } catch {}
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  try {
    appendFileSync(join(LOG_DIR, 'harness_continuation.log'),
      `${ts}  INFO  removed stale .harness_active (slug=${markerSlug})\n`);
  } catch {}
}

// Sweep leaked single-use consent-gate markers (Finding B). These are written
// by the consent_gate_grant UserPromptSubmit hook and consumed (deleted) by the
// matching approval guard on the token Write. If a session ends after the grant
// but before the guard fired, the marker lingers — a leaked, replayable consent
// window. Best-effort: remove any older than the gate-marker TTL.
let gateTtl = projectGet('.consent.gate_marker_ttl_seconds');
if (typeof gateTtl !== 'number' || !Number.isFinite(gateTtl)) gateTtl = 120;
const nowMs = Date.now();
for (const name of ['.commit_consent_grant', '.push_consent_grant', '.spec_approval_grant', '.swarm_approval_grant']) {
  const grant = join(STATE_DIR, name);
  if (!existsSync(grant)) continue;
  let ageSec = Infinity;
  try {
    // Markers carry their grant epoch on line 1; fall back to mtime.
    const first = readFileSync(grant, 'utf8').split(/\r?\n/)[0].trim();
    if (/^\d+$/.test(first)) ageSec = Math.floor(nowMs / 1000) - parseInt(first, 10);
    else ageSec = Math.floor((nowMs - statSync(grant).mtimeMs) / 1000);
  } catch {
    try { ageSec = Math.floor((nowMs - statSync(grant).mtimeMs) / 1000); } catch {}
  }
  if (ageSec <= gateTtl) continue;
  try { rmSync(grant); } catch {}
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  try {
    appendFileSync(join(LOG_DIR, 'harness_continuation.log'),
      `${ts}  INFO  swept leaked consent marker ${name} (age=${ageSec}s ttl=${gateTtl}s)\n`);
  } catch {}
}

const memDir = join(CLAUDE_DOTDIR, 'memory');
try {
  if (!statSync(memDir).isDirectory()) process.exit(0);
} catch {
  process.exit(0);
}

let sessionSource = payloadGet(payload, '.source');
if (!sessionSource) sessionSource = 'startup';

let context = '';
try { context = buildIndex({ memDir, projectRoot: CLAUDE_PROJECT_ROOT, sessionSource }); }
catch (e) { process.stderr.write(`memory_session_start: index build failed: ${e.message}\n`); }

if (!context) process.exit(0);

process.stdout.write(context + '\n');
logLine('memory_session_start', 'emitted memory index');
process.exit(0);
