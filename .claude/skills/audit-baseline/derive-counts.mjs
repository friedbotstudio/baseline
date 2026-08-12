// derive-counts.mjs — the single source of truth for harness governance counts.
//
// Every surface that states a count ("22 hooks", "40 skills", "6 commands", …)
// should derive it from here or be cross-checked against it by audit-baseline.
// Two consumers import this module: `audit.mjs` (drift cross-check) and the
// site's `_data/baseline.cjs` (rendered counts). Pure read of the on-disk
// artifacts — deterministic, no network, no writes.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Imported, not re-listed. This was the third independent copy of the category
// list — it sat at seven while CANONICAL held eight, so `memoryFiles` counted 7
// against a roster of 8 and the disk-vs-roster assertion failed even though every
// category was present. memory-shape.mjs and expected-baseline.mjs read the same
// oracle for the same reason.
import { CANONICAL as CANONICAL_MEMORY } from '../memory-index/categories.mjs';

const SPELLED = {
  1: 'one', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 10: 'ten',
  11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen',
  22: 'twenty-two', 24: 'twenty-four', 26: 'twenty-six', 40: 'forty',
  41: 'forty-one', 42: 'forty-two', 43: 'forty-three', 44: 'forty-four', 45: 'forty-five',
  46: 'forty-six', 48: 'forty-eight', 50: 'fifty', 52: 'fifty-two', 53: 'fifty-three', 56: 'fifty-six',
};

// The skills category breakdown. Category ASSIGNMENT is editorial (not
// mechanically inferable from disk), so it is authored here rather than
// derived — but it lives beside the deriver so the site and the audit share one
// copy, and audit-baseline asserts its sum equals the derived skills total.
export const SKILL_CATEGORIES = {
  artifact: 4,
  phases: 10,
  workers: 5,
  specHelpers: 5,
  orchestration: 3,
  memory: 1,
  navigation: 1,
  phaseHelpers: 1,
  generators: 4,
  sharedGlobals: 10,
  audit: 1,
  altTracks: 2,
  maintenance: 4,
  sprint: 5,
  roadmap: 2,
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

const TRACK_SOURCES = {
  template: ['obj', 'template', '.claude', 'workflows.jsonl'],
  live: ['.claude', 'workflows.jsonl'],
};

function tallyTracks(file) {
  let canonical = 0;
  let subTracks = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let track;
    try { track = JSON.parse(line); } catch { continue; }
    if (track.selectable === true) canonical += 1;
    else if (track.selectable === false) subTracks += 1;
  }
  return { canonical, subTracks };
}

// A "ships in the pristine template" claim must be derived from the TEMPLATE,
// not the dev tree. Counting the live tree let the site assert that 9 tracks
// shipped while the template shipped 8 — `org` existed only in this repo. The
// returned `source` tells callers which tree the number came from.
export function countTracks(root, { source = 'template' } = {}) {
  const order = source === 'live' ? ['live'] : ['template', 'live'];
  for (const key of order) {
    const file = join(root, ...TRACK_SOURCES[key]);
    if (existsSync(file)) return { ...tallyTracks(file), source: key };
  }
  return { canonical: 0, subTracks: 0, source: 'none' };
}

// Every shipped-count claim on a rendered page must equal the template count.
// `pages` is [{ path, text }] so the caller owns IO and this stays pure.
export function checkShippedClaims({ templateCount, pages = [] }) {
  const CLAIM = /(\d+)\s+(?:selectable tracks|canonical shapes|canonical tracks)\s+ship in the pristine template/gi;
  const offenders = [];
  for (const page of pages) {
    for (const m of String(page.text || '').matchAll(CLAIM)) {
      const claimed = Number(m[1]);
      if (claimed !== templateCount) {
        offenders.push({ path: page.path, claimed, expected: templateCount });
      }
    }
  }
  return { ok: offenders.length === 0, offenders };
}

function listMcpServers(root) {
  const p = join(root, '.mcp.json');
  if (!existsSync(p)) return [];
  try {
    const m = JSON.parse(readFileSync(p, 'utf8'));
    return Object.keys(m.mcpServers || m.servers || {}).sort();
  } catch { return []; }
}

function countMcpServers(root) {
  return listMcpServers(root).length;
}

function namesTracks(file) {
  const canonical = [];
  const subTracks = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let track;
    try { track = JSON.parse(line); } catch { continue; }
    if (track.selectable === true) canonical.push(track.track_id);
    else if (track.selectable === false) subTracks.push(track.track_id);
  }
  return { canonical: canonical.sort(), subTracks: subTracks.sort() };
}

// deriveNames — the roster behind the four Reference pages.
//
// deriveCounts answers "how many". A page that lists hooks or tracks needs
// "which ones", and the check that verifies the page needs the same answer.
// Both read this function, so the rendered page and the drift check cannot
// disagree about what the roster is.
//
// Kept as a SEPARATE export rather than folded into deriveCounts: that
// function's return shape is asserted by strict deepEqual in several places,
// so widening it breaks callers for no gain.
//
// Every list is sorted and deduped. Callers render them in this order, which
// makes a page diff reviewable when a hook is added.
export function deriveNames(root) {
  const claude = join(root, '.claude');
  const skillsRoot = join(claude, 'skills');
  const tracksFile = [
    join(root, ...TRACK_SOURCES.template),
    join(root, ...TRACK_SOURCES.live),
  ].find((f) => existsSync(f));

  return {
    hooks: listFiles(join(claude, 'hooks'))
      .filter((n) => n.endsWith('.mjs'))
      .map((n) => n.replace(/\.mjs$/, ''))
      .sort(),
    skills: listDirs(skillsRoot)
      .filter((slug) => skillIsBaselineOwned(join(skillsRoot, slug)))
      .sort(),
    commands: listFiles(join(claude, 'commands'))
      .filter((n) => n.endsWith('.md'))
      .map((n) => n.replace(/\.md$/, ''))
      .sort(),
    subagents: listFiles(join(claude, 'agents'))
      .filter((n) => n.endsWith('.md'))
      .map((n) => n.replace(/\.md$/, ''))
      .sort(),
    tracks: tracksFile ? namesTracks(tracksFile) : { canonical: [], subTracks: [] },
    mcpServers: listMcpServers(root),
  };
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
    .filter((name) => existsSync(join(claude, 'memory', `${name}.md`))
      || existsSync(join(claude, 'memory', name))).length;
  return {
    skills,
    hooks,
    commands,
    subagents,
    // Strip `source` here: deriveCounts' shape is a long-standing contract
    // asserted by strict deepEqual. `source` stays available to direct
    // countTracks callers that need to know which tree they read.
    tracks: (({ canonical, subTracks }) => ({ canonical, subTracks }))(countTracks(root)),
    memoryFiles,
    mcpServers: countMcpServers(root),
  };
}
