#!/usr/bin/env node
// Swarm Approval Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Symmetric to spec_approval_guard for gate B (/approve-swarm). Two modes:
//
//   1. Approval artifacts (.claude/state/swarm_approvals/<slug>.approval) —
//      writable only when a fresh slug-matched marker at
//      .claude/state/.swarm_approval_grant exists. Marker is written by
//      consent_gate_grant.mjs on /approve-swarm. Validated + consumed via
//      validateConsentMarker.
//
//   2. The marker file itself — Claude SHALL NEVER write it via tool.

import { basename } from 'node:path';
import {
  CONSENT_MARKER_SWARM,
  CONSENT_MARKER_SWARM_REL,
  readPayload,
  payloadGet,
  canonicalRel,
  canonicalSlug,
  emitAllow,
  blockMarkerSelfWrite,
  validateConsentMarker,
} from './lib/common.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();
const rel = canonicalRel(file);
if (!rel) emitAllow();

blockMarkerSelfWrite(rel, CONSENT_MARKER_SWARM_REL, 'Swarm Approval Guard', '/approve-swarm <slug>');

if (rel.startsWith('.claude/state/swarm_approvals/') && rel.endsWith('.approval')) {
  const stem = basename(rel, '.approval');
  const expectedSlug = canonicalSlug(stem);
  validateConsentMarker(CONSENT_MARKER_SWARM, 'Swarm Approval Guard', '/approve-swarm <slug>', expectedSlug);
  emitAllow();
}

emitAllow();
