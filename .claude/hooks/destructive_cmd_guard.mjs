#!/usr/bin/env node
// Destructive Command Guard — PreToolUse(Bash)
//
// JS port of destructive_cmd_guard.sh. Behavior preserved verbatim; the only
// change is in-process JSON parsing instead of forking python3 5+ times per
// fire. Drops per-call cost from ~4.3 s to ~0.3 s on macOS.
//
// Two tiers (unchanged):
//   - hard_block_patterns: block outright, cannot be overridden here.
//   - ask_patterns: emit an "ask" decision so the user is prompted each time.
//
// Patterns come from .destructive.hard_block_patterns / .destructive.ask_patterns
// in .claude/project.json. Mode selector .destructive.mode is "ask" (default)
// or "block" — block upgrades ask_patterns to deny.

import {
  readPayload,
  payloadGet,
  projectGet,
  emitBlock,
  emitAsk,
  emitAllow,
  logLine,
} from './lib/common.mjs';

function cmdMatchesAny(cmd, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  for (const p of patterns) {
    if (typeof p !== 'string' || p === '') continue;
    let re;
    try { re = new RegExp(p); } catch { continue; }
    if (re.test(cmd)) return true;
  }
  return false;
}

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (tool !== 'Bash') emitAllow();

const cmd = payloadGet(payload, '.tool_input.command');
if (!cmd) emitAllow();

const hard = projectGet('.destructive.hard_block_patterns');
if (cmdMatchesAny(cmd, hard)) {
  logLine('destructive_cmd_guard', `HARD BLOCK: ${cmd}`);
  emitBlock(`Destructive Command Guard: '${cmd}' matches a hard-block pattern (catastrophic/irreversible). This is not overridable by confirmation. If this is genuinely necessary, edit .claude/project.json .destructive.hard_block_patterns.`);
}

let mode = projectGet('.destructive.mode');
if (!mode) mode = 'ask';

const ask = projectGet('.destructive.ask_patterns');
if (cmdMatchesAny(cmd, ask)) {
  if (mode === 'block') {
    logLine('destructive_cmd_guard', `BLOCK (mode=block): ${cmd}`);
    emitBlock(`Destructive Command Guard: '${cmd}' matches a destructive pattern and mode=block. Ask the user to run this themselves, or set .destructive.mode to 'ask' in project.json.`);
  }
  logLine('destructive_cmd_guard', `ASK: ${cmd}`);
  emitAsk(`Destructive Command Guard: '${cmd}' looks destructive (matches an ask pattern). Confirm this is intentional before proceeding.`);
}

emitAllow();
