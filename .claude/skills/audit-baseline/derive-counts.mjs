// derive-counts.mjs — the single source of truth for harness governance counts.
//
// Every surface that states a count ("22 hooks", "40 skills", "6 commands", …)
// should derive it from here or be cross-checked against it by audit-baseline.
// Two consumers import this module: `audit.mjs` (drift cross-check) and the
// site's `_data/baseline.cjs` (rendered counts). Pure read of the on-disk
// artifacts — deterministic, no network, no writes.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CANONICAL_MEMORY = [
  'landmarks', 'libraries', 'decisions', 'landmines',
  'conventions', 'pending-questions', 'backlog',
];

const SPELLED = {
  1: 'one', 3: 'three', 5: 'five', 6: 'six', 7: 'seven',
  11: 'eleven', 12: 'twelve', 13: 'thirteen', 22: 'twenty-two', 40: 'forty',
};

// The skills category breakdown. Category ASSIGNMENT is editorial (not
// mechanically inferable from disk), so it is authored here rather than
// derived — but it lives beside the deriver so the site and the audit share one
// copy, and audit-baseline asserts its sum equals the derived skills total.
export const SKILL_CATEGORIES = {
  artifact: 4,
  phases: 10,
  workers: 5,
  specHelpers: 4,
  orchestration: 3,
  memory: 1,
  navigation: 1,
  phaseHelpers: 1,
  generators: 1,
  sharedGlobals: 7,
  audit: 1,
  altTracks: 1,
  maintenance: 1,
};

// Spell out a count for prose/word-form surfaces. Throws on an unmapped value so
// a new governance number forces this map to be updated rather than silently
// emitting a numeral where a word is expected.
export function numToWord(n) {
  if (!Object.prototype.hasOwnProperty.call(SPELLED, n)) {
    throw new Error(`numToWord: unmapped value ${n} — add it to derive-counts.mjs`);
  }
  return SPELLED[n];
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch { return []; }
}

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch { return []; }
}

function skillIsBaselineOwned(skillDir) {
  const skillMd = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMd)) return false;
  const fm = readFileSync(skillMd, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) return false;
  const owner = fm[1].match(/^owner:\s*(\S+)\s*$/m);
  return owner ? owner[1] === 'baseline' : false;
}

function countTracks(root) {
  const p = join(root, '.claude', 'workflows.jsonl');
  let canonical = 0;
  let subTracks = 0;
  if (!existsSync(p)) return { canonical, subTracks };
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let track;
    try { track = JSON.parse(line); } catch { continue; }
    if (track.selectable === true) canonical += 1;
    else if (track.selectable === false) subTracks += 1;
  }
  return { canonical, subTracks };
}

function countMcpServers(root) {
  const p = join(root, '.mcp.json');
  if (!existsSync(p)) return 0;
  try {
    const m = JSON.parse(readFileSync(p, 'utf8'));
    return Object.keys(m.mcpServers || m.servers || {}).length;
  } catch { return 0; }
}

// Derive every governance count from the artifacts under `root`.
export function deriveCounts(root) {
  const claude = join(root, '.claude');
  const skillsRoot = join(claude, 'skills');
  const skills = listDirs(skillsRoot)
    .filter((slug) => skillIsBaselineOwned(join(skillsRoot, slug))).length;
  const hooks = listFiles(join(claude, 'hooks')).filter((n) => n.endsWith('.mjs')).length;
  const commands = listFiles(join(claude, 'commands')).filter((n) => n.endsWith('.md')).length;
  const subagents = listFiles(join(claude, 'agents')).filter((n) => n.endsWith('.md')).length;
  const memoryFiles = CANONICAL_MEMORY
    .filter((name) => existsSync(join(claude, 'memory', `${name}.md`))).length;
  return {
    skills,
    hooks,
    commands,
    subagents,
    tracks: countTracks(root),
    memoryFiles,
    mcpServers: countMcpServers(root),
  };
}
