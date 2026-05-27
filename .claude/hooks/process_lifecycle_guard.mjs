#!/usr/bin/env node
// process_lifecycle_guard — PreToolUse / Bash
//
// Advisory hook. Detects process-management Bash patterns (kill, pkill, lsof,
// fuser, dev-server spawns) and surfaces relevant memory entries inline so
// Claude reads them at the moment of action rather than relying on
// session-start salience to persist across turns.
//
// Output: prints matched memory entries to stderr (Claude Code surfaces
// stderr in the tool transcript). Always emits allow — never blocks.
// Cross-references CLAUDE.md Article IX clauses 6 + 7.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAUDE_DOTDIR,
  readPayload,
  payloadGet,
  emitAllow,
  emitInfo,
  logLine,
} from './lib/common.mjs';

const payload = await readPayload();

const cmd = payloadGet(payload, '.tool_input.command');
if (!cmd) emitAllow();

// Trigger detection. Patterns chosen to match the dev-server-ownership and
// lsof-port-kill-takes-firefox-with-it surfaces. Whole-word matches.
const TRIGGERS = [
  /\bkill\b/, /\bpkill\b/, /\bkillall\b/, /\blsof\b/, /\bfuser\b/,
  /npm run [^|;&]*(serve|dev)\b/,
  /\byarn dev\b/, /\bpnpm dev\b/,
  /\beleventy\s+(--serve|serve)\b/,
  /\bvite\b/, /\bnext dev\b/, /\bastro dev\b/, /\bhttp\.server\b/,
];
if (!TRIGGERS.some((re) => re.test(cmd))) emitAllow();

const memDir = join(CLAUDE_DOTDIR, 'memory');
const TARGETS = [
  ['conventions.md', 'dev-server-ownership'],
  ['landmines.md',   'lsof-port-kill-takes-firefox-with-it'],
];

const chunks = [];
for (const [fname, anchor] of TARGETS) {
  const p = join(memDir, fname);
  if (!existsSync(p)) continue;
  let text;
  try { text = readFileSync(p, 'utf8'); } catch { continue; }
  // Capture from "## <anchor>" up to the next "## " (or EOF).
  const escAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^##\\s+${escAnchor}\\b[\\s\\S]*?(?=^##\\s|$(?![\\s\\S]))`, 'm');
  const m = re.exec(text);
  if (m) chunks.push(`--- ${fname} ---\n${m[0].trimEnd()}`);
}

const excerpts = chunks.join('\n\n');
if (!excerpts) {
  emitInfo("process_lifecycle_guard: command matched a process-management pattern, but no memory entries (`conventions.md → dev-server-ownership`, `landmines.md → lsof-port-kill-takes-firefox-with-it`) were found. Consider `/memory-flush` or restoring the entries before proceeding.");
  logLine('process_lifecycle_guard', `fired with empty memory: ${cmd}`);
  emitAllow();
}

emitInfo(`process_lifecycle_guard — process-management memory surfaced (verbatim then interpretation):

${excerpts}

This advisory fires whenever a Bash command matches a process-management pattern. CLAUDE.md Article IX clause 7: read the verbatim above, treat it as binding for the current operation, and prefer verbatim over interpretation when they conflict.`);

logLine('process_lifecycle_guard', `surfaced: ${cmd.slice(0, 120)}`);
emitAllow();
