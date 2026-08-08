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

import { isAbsolute, join, relative } from 'node:path';
import {
  CLAUDE_DOTDIR,
  readPayload,
  payloadGet,
  emitAllow,
  emitInfo,
  logLine,
} from './lib/common.mjs';
import { surfaceScopedMemory } from './lib/scoped-memory.mjs';
import {
  surfaceGovernedMemory,
  renderGovernedHits,
  surfaceCorpusLocation,
  renderCorpusLocation,
} from './lib/governed-memory.mjs';
import { resolveCategory } from '../skills/memory-index/lift-fields.mjs';

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

// Triggers two and three (epic D3; corpus reachability). Terminal: every branch
// exits via emitAllow, so the write leg never falls past it.
//
// BOTH blocks are composed BEFORE any emitAllow, and that ordering is load-bearing:
// emitAllow EXITS THE PROCESS. The earlier shape returned early when no memory
// entry governed the path, so a file with a corpus element but no `governs:` entry
// surfaced nothing at all — the same silence the path-governed trigger was built
// to end, one layer up.
function surfaceGovernedMemoryFor(filePath) {
  const rootDir = join(CLAUDE_DOTDIR, '..');
  const target = repoRelative(filePath, rootDir);
  const governing = governingMemoryBlock(target, rootDir);
  const corpus = corpusLocationBlock(target, rootDir);
  const blocks = [governing, corpus].filter(Boolean);

  if (!blocks.length) emitAllow();

  emitInfo(`process_lifecycle_guard — context surfaced for \`${filePath}\`:

${blocks.join('\n\n')}

CLAUDE.md Article IX clause 7: treat the surfaced entry/entries as binding for this write; prefer verbatim over interpretation when they conflict.`);
  logLine('process_lifecycle_guard', `surfaced ${blocks.length} block(s) for ${filePath}`);
  emitAllow();
}

// The tool payload carries an ABSOLUTE file_path, while both things a path is
// looked up against — `governs:` globs and corpus anchors — are repo-relative.
// Measured on this tree: the same file resolves 9 governing entries relative and
// 0 absolute, so BOTH path-keyed triggers matched nothing on every real write.
// Normalising once here is what makes either of them fire.
function repoRelative(filePath, rootDir) {
  return isAbsolute(filePath) ? relative(rootDir, filePath) : filePath;
}

function governingMemoryBlock(filePath, rootDir) {
  let hits = [];
  try {
    hits = surfaceGovernedMemory(filePath, { rootDir });
  } catch {
    return null;
  }
  if (!hits.length) return null;

  const rendered = renderGovernedHits(hits);
  return rendered.mode === 'verbatim'
    ? rendered.hits
      .map((h) => `--- ${h.category}/${h.key} ---\n> ${h.verbatim.split('\n').join('\n> ')}\n\n${h.interpretation}`.trimEnd())
      .join('\n\n')
    : `${hits.length} entries govern \`${filePath}\` (walk from \`${rendered.entryPoint}\`):\n${rendered.summary}`;
}

function corpusLocationBlock(filePath, rootDir) {
  const location = surfaceCorpusLocation(filePath, { rootDir, specDir: join(rootDir, 'docs/system') });
  return location ? renderCorpusLocation(location) : null;
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
    // `surfaceScopedMemory` already ranks load-bearing first; this only MARKS them,
    // so the reader can see why a row leads instead of trusting the order silently.
    // Re-sorting here would be a second sort site that could disagree with the first.
    const shown = hits.slice(0, INDEX_CAP)
      .map((h) => `- ${h.load_bearing ? '**load-bearing** ' : ''}${h.category}/${h.key} — ${clip(h.hook)}`)
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
// Addressed by CATEGORY and KEY, never by filename. The leg used to read
// `conventions.md` / `landmines.md` directly and `continue` past each missing
// file, so on a sharded store — this repo's shape since 2026-07-17 — `chunks` was
// always empty and every match printed the "nothing found" fallback while both
// entries sat on disk as shards. `resolveCategory` is the shape-agnostic reader
// every other consumer already routes through, and it is shard-first.
const TARGETS = [
  ['conventions', 'dev-server-ownership'],
  ['landmines',   'lsof-port-kill-takes-firefox-with-it'],
];

function entryFor(category, key) {
  try {
    return resolveCategory(memDir, category).entries.find((e) => e.key === key) ?? null;
  } catch {
    return null;
  }
}

const chunks = [];
for (const [category, key] of TARGETS) {
  const entry = entryFor(category, key);
  if (entry) chunks.push(`--- ${category}/${key} ---\n${entry.body.trimEnd()}`);
}

const excerpts = chunks.join('\n\n');
if (!excerpts) {
  const named = TARGETS.map(([category, key]) => `\`${category}/${key}\``).join(', ');
  emitInfo(`process_lifecycle_guard: command matched a process-management pattern, but no memory entries (${named}) were found in either store shape. Consider \`/memory-flush\` or restoring the entries before proceeding.`);
  logLine('process_lifecycle_guard', `fired with empty memory: ${cmd}`);
  emitAllow();
}

emitInfo(`process_lifecycle_guard — process-management memory surfaced (verbatim then interpretation):

${excerpts}

This advisory fires whenever a Bash command matches a process-management pattern. CLAUDE.md Article IX clause 7: read the verbatim above, treat it as binding for the current operation, and prefer verbatim over interpretation when they conflict.`);

logLine('process_lifecycle_guard', `surfaced: ${cmd.slice(0, 120)}`);
emitAllow();
