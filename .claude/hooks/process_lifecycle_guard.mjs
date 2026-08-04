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
import { surfaceScopedMemory } from './lib/scoped-memory.mjs';
import { surfaceGovernedMemory, renderGovernedHits } from './lib/governed-memory.mjs';

// Phase-artifact prefixes → the workflow phase whose scoped memory should surface
// before the write. This is the decision-point-injection leg (roadmap T4): a Write
// to docs/specs/** surfaces every fact tagged `scope: spec` verbatim before the
// spec is authored. Presence-based — `surfaceScopedMemory` reads the sharded
// category dirs and returns [] when the store is not migrated, so this no-ops on a
// flat-file store and never blocks.
const PHASE_BY_PREFIX = [
  ['docs/specs/', 'spec'],
  ['docs/intake/', 'intake'],
  ['docs/scout/', 'scout'],
  ['docs/research/', 'research'],
  ['docs/security/', 'security'],
];

function phaseForPath(filePath) {
  const norm = String(filePath).replace(/\\/g, '/');
  for (const [prefix, phase] of PHASE_BY_PREFIX) {
    if (norm.includes(prefix)) return phase;
  }
  return null;
}

// The second trigger (epic D3). Terminal: every branch exits via emitAllow, so the
// write leg never falls past it.
function surfaceGovernedMemoryFor(filePath) {
  const rootDir = join(CLAUDE_DOTDIR, '..');
  let hits = [];
  try {
    hits = surfaceGovernedMemory(filePath, { rootDir });
  } catch {
    emitAllow();
  }
  if (!hits.length) emitAllow();

  const rendered = renderGovernedHits(hits);
  const body = rendered.mode === 'verbatim'
    ? rendered.hits
      .map((h) => `--- ${h.category}/${h.key} ---\n> ${h.verbatim.split('\n').join('\n> ')}\n\n${h.interpretation}`.trimEnd())
      .join('\n\n')
    : `${hits.length} entries govern \`${filePath}\` (walk from \`${rendered.entryPoint}\`):\n${rendered.summary}`;

  emitInfo(`process_lifecycle_guard — governing memory surfaced for \`${filePath}\`:

${body}

CLAUDE.md Article IX clause 7: treat the surfaced entry/entries as binding for this write; prefer verbatim over interpretation when they conflict.`);
  logLine('process_lifecycle_guard', `surfaced ${hits.length} governing entr${hits.length === 1 ? 'y' : 'ies'} for ${filePath}`);
  emitAllow();
}

function surfacePhaseScopedMemory(filePath) {
  const phase = filePath ? phaseForPath(filePath) : null;
  // No phase prefix used to end the write leg here. It now falls through to the
  // path-keyed trigger, so editing a SOURCE file surfaces the decisions governing
  // it — the whole point of ticket C, and done without a 27th hook.
  if (!phase) surfaceGovernedMemoryFor(filePath);
  const rootDir = join(CLAUDE_DOTDIR, '..');
  const hits = surfaceScopedMemory(phase, { rootDir });
  if (!hits.length) emitAllow();
  // Small result sets show full verbatim (targeted surfacing); larger sets show a
  // bounded index of `category/key — hook` so a spec write is not buried under
  // dozens of full entries — Claude reads the specific fact file before writing.
  const VERBATIM_LIMIT = 3;
  const INDEX_CAP = 15;
  let body;
  if (hits.length <= VERBATIM_LIMIT) {
    body = hits
      .map((h) => `--- ${h.category}/${h.key} ---\n> ${h.verbatim.split('\n').join('\n> ')}\n\n${h.interpretation}`.trimEnd())
      .join('\n\n');
  } else {
    const clip = (s) => (s.length > 90 ? `${s.slice(0, 87)}…` : s);
    const shown = hits.slice(0, INDEX_CAP)
      .map((h) => `- ${h.category}/${h.key} — ${clip(h.hook)}`)
      .join('\n');
    const more = hits.length > INDEX_CAP ? `\n…and ${hits.length - INDEX_CAP} more.` : '';
    body = `${hits.length} facts scoped to \`${phase}\` (read the specific fact file before writing):\n${shown}${more}`;
  }
  emitInfo(`process_lifecycle_guard — phase-scoped memory surfaced for \`${phase}\`:

${body}

CLAUDE.md Article IX clause 7: treat the surfaced lesson(s) as binding for this write; prefer verbatim over interpretation when they conflict.`);
  logLine('process_lifecycle_guard', `surfaced ${hits.length} scoped fact(s) for phase ${phase}: ${filePath}`);
  emitAllow();
}

const payload = await readPayload();

const cmd = payloadGet(payload, '.tool_input.command');
if (!cmd) surfacePhaseScopedMemory(payloadGet(payload, '.tool_input.file_path'));

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
