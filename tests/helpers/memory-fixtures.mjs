// Shared fixtures for the Tier 2/3 memory-capture tests.
// Foundation: tmp transcript/_pending/_thread builders + corpus loader + a
// dynamic-import guard for modules/exports that don't exist until implemented.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, cpSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const PENDING_SKELETON = [
  '---',
  'owners: [memory_stop.mjs writes; /memory-flush clears]',
  'category: auto-extracted candidates awaiting curation',
  'verifies-against: none',
  '---',
  '',
  '# Pending memory candidates',
  '',
  '---',
  '',
].join('\n');

export function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'memcap23-'));
  const memDir = join(root, '.claude', 'memory');
  const stateDir = join(root, '.claude', 'state');
  mkdirSync(memDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  const pending = join(memDir, '_pending.md');
  writeFileSync(pending, PENDING_SKELETON, 'utf8');
  return { root, memDir, stateDir, pending };
}

export function writeTranscript(root, userTexts) {
  const p = join(root, 'transcript.jsonl');
  const lines = userTexts.map((text, i) =>
    JSON.stringify({ uuid: `u${i + 1}`, message: { role: 'user', content: [{ type: 'text', text }] } }));
  writeFileSync(p, lines.join('\n') + '\n', 'utf8');
  return p;
}

export function readPending(pending) {
  return readFileSync(pending, 'utf8');
}

export function loadCorpus() {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'tests/fixtures/memory-capture/corpus.json'), 'utf8'));
}

// Import a module that may not exist yet; returns null on failure so a test can
// assert presence and fail with a clear message (RED until implemented).
export async function tryImport(relFromRepo) {
  try {
    return await import(join(REPO_ROOT, relFromRepo));
  } catch {
    return null;
  }
}

// ─── Foundation: sharded-corpus fixtures (shard-migration-repair) ───

// Imported, not re-listed: everyShardFile() walks this, so a stale local copy
// would make every fixture in the suite silently skip a newly added category.
export { CANONICAL as CANONICAL_CATEGORIES } from '../../.claude/skills/memory-index/categories.mjs';
import { CANONICAL as CANONICAL_CATEGORIES } from '../../.claude/skills/memory-index/categories.mjs';

// Copy the LIVE .claude/memory into a throwaway root. Every test that exercises
// real corpus data must go through this — the live store is in its pre-repair
// state and a mutating test would corrupt the data the repair exists to fix.
export function copyLiveCorpus(prefix = 'memcorpus-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const memDir = join(root, '.claude', 'memory');
  mkdirSync(join(root, '.claude'), { recursive: true });
  cpSync(join(REPO_ROOT, '.claude', 'memory'), memDir, { recursive: true });
  return { root, memDir };
}

// Build a sharded fact file. `fields` land in frontmatter; `bodyLines` land verbatim.
export function writeShard(memDir, category, slug, { key, fields = {}, bodyLines = [] }) {
  const dir = join(memDir, category);
  mkdirSync(dir, { recursive: true });
  const preamble = [
    `key: ${key ?? slug}`,
    `category: ${category}`,
    'scope: []',
    ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
  ];
  const path = join(dir, `${slug}.md`);
  writeFileSync(path, `---\n${preamble.join('\n')}\n---\n\n${bodyLines.join('\n')}\n`, 'utf8');
  return path;
}

// Write a flat canonical file (the pre-migration / fresh-consumer-install shape).
export function writeFlatCategory(memDir, category, blocks) {
  mkdirSync(memDir, { recursive: true });
  const body = blocks.map(({ key, bodyLines = [] }) => `## ${key}\n\n${bodyLines.join('\n')}\n`).join('\n');
  const path = join(memDir, `${category}.md`);
  writeFileSync(path, `---\nowners: [test]\nsize-cap: 500\n---\n\n${body}`, 'utf8');
  return path;
}

export function everyShardFile(memDir) {
  const out = [];
  for (const category of CANONICAL_CATEGORIES) {
    const dir = join(memDir, category);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) out.push(join(dir, f));
  }
  return out;
}

// Count field-shaped `- name: value` bullets in entry BODIES, keyed by lowercased
// name. The census that proves the relift lifted metadata without eating prose.
export function bodyBulletCensus(memDir) {
  const counts = {};
  for (const file of everyShardFile(memDir)) {
    const text = readFileSync(file, 'utf8');
    const body = text.split(/^---$/m).slice(2).join('---');
    for (const line of body.split('\n')) {
      const m = /^-\s+([A-Za-z][A-Za-z-]*):\s+(.+)$/.exec(line.trim());
      if (m) counts[m[1].toLowerCase()] = (counts[m[1].toLowerCase()] || 0) + 1;
    }
  }
  return counts;
}

export function snapshotTree(memDir) {
  const snap = {};
  for (const file of everyShardFile(memDir)) snap[file.slice(memDir.length)] = readFileSync(file, 'utf8');
  return snap;
}

export { existsSync, join, readFileSync, readdirSync, rmSync };
