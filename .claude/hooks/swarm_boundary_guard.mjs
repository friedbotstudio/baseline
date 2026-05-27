#!/usr/bin/env node
// Swarm Boundary Guard — PreToolUse(Write|Edit|MultiEdit)
//
// Within an active wave, writes may only touch files in some task's declared
// write_set. write_sets are pairwise disjoint within a wave (enforced by
// swarm-plan), so any write uniquely maps back to exactly one task — the
// guard only verifies the file is owned by SOMEONE in the active wave.
//
// Control file: .claude/state/swarm/active_wave.json
// Semantics:
//   - active_wave.json missing → not in swarm, allow.
//   - file path under an exempt prefix → allow.
//   - file path in enforced prefix and in union(write_sets) → allow.
//   - file path in enforced prefix and NOT in any write_set → deny.
//   - file path NOT in enforced prefix → allow.

import { existsSync, readFileSync } from 'node:fs';
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

const activePath = join(STATE_DIR, 'swarm', 'active_wave.json');
if (!existsSync(activePath)) emitAllow();

let active;
try { active = JSON.parse(readFileSync(activePath, 'utf8')); }
catch (e) {
  emitBlock(`Swarm Boundary Guard: active_wave.json exists but could not be parsed (${e.message}). This is a swarm-state corruption — swarm-dispatch must clean up and re-plan.`);
}

let exemptPrefixes = ['.claude/', '.git/'];
let enforcedPrefixes = null;
const swExempt = projectGet('.swarm.exempt_path_prefixes');
if (Array.isArray(swExempt)) exemptPrefixes = swExempt;
const swEnforced = projectGet('.swarm.enforced_path_prefixes');
if (Array.isArray(swEnforced)) enforcedPrefixes = swEnforced;

for (const p of exemptPrefixes) {
  if (rel.startsWith(p)) emitAllow();
}

if (enforcedPrefixes !== null && !enforcedPrefixes.some((p) => rel.startsWith(p))) {
  emitAllow();
}

const writeSets = active.write_sets || [];
const owners = new Map();
for (const entry of writeSets) {
  const tid = entry.task_id || '?';
  for (const f of (entry.files || [])) owners.set(f, tid);
}

if (owners.has(rel)) emitAllow();

const slug = active.slug || '?';
const wave = active.wave ?? '?';
const ownerKeys = [...owners.keys()].sort();
let ownersPreview = ownerKeys.slice(0, 6).join(', ');
if (ownerKeys.length > 6) ownersPreview += `, … (${ownerKeys.length} total)`;

emitBlock(`Swarm Boundary Guard: write to '${rel}' denied. Swarm '${slug}' wave ${wave} is active; no task in this wave owns that file. Files owned by this wave: ${ownersPreview || '(none)'}. Either (a) abort this write, (b) stop the swarm and re-plan so the file is in some task's write_set, or (c) if this is a genuinely required file that was missed at plan time, surface it — do not patch mid-wave.`);
