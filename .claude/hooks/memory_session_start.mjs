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
  sweepLeakedGrantMarkers,
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
// window. The sweep (lib/common.mjs) removes any older than the gate-marker TTL
// and never follows a symlinked marker to its target (7f2c LOW symlink/TOCTOU).
let gateTtl = projectGet('.consent.gate_marker_ttl_seconds');
if (typeof gateTtl !== 'number' || !Number.isFinite(gateTtl)) gateTtl = 120;
const sweptMarkers = sweepLeakedGrantMarkers(STATE_DIR, { ttlSeconds: gateTtl });
if (sweptMarkers.length) {
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  for (const m of sweptMarkers) {
    const detail = m.reason === 'symlink' ? 'anomalous symlink (link removed, target untouched)' : `age=${m.ageSec}s ttl=${gateTtl}s`;
    try {
      appendFileSync(join(LOG_DIR, 'harness_continuation.log'),
        `${ts}  INFO  swept leaked consent marker ${m.name} (${detail})\n`);
    } catch {}
  }
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
