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
  'owners: [memory_stop.mjs writes; /memory-sync clears]',
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
  // The central system spec is a docs/ artifact, not a memory category — so it gets
  // its own root here rather than a subdirectory of memDir. Fixtures that seed a
  // corpus take specDir; fixtures that seed canonical categories take memDir, and
  // conflating them is what silently repoints annotation/load_bearing resolution.
  const specDir = join(root, 'docs', 'system');
  mkdirSync(memDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  // specDir is deliberately NOT created: `store.ensureWorkspace` preflights an
  // absent corpus and must never conjure one, so a fixture that pre-creates it
  // would make that contract untestable. `makeWorkspace(specDir)` creates it.
  const pending = join(memDir, '_pending.md');
  writeFileSync(pending, PENDING_SKELETON, 'utf8');
  return { root, memDir, specDir, stateDir, pending };
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
// Copies BOTH roots: canonical memory (where `governed_by` / `rests_on` keys
// resolve) and the corpus (where element records live). A contribution touches
// both — it writes to the corpus but validates its refs against memory — so a
// fixture that copied only one would make ref-refusal tests pass vacuously.
export function copyLiveCorpus(prefix = 'memcorpus-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const memDir = join(root, '.claude', 'memory');
  const specDir = join(root, 'docs', 'system');
  mkdirSync(join(root, '.claude'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  cpSync(join(REPO_ROOT, '.claude', 'memory'), memDir, { recursive: true });
  cpSync(join(REPO_ROOT, 'docs', 'system'), specDir, { recursive: true });
  return { root, memDir, specDir };
}

// Build a sharded fact file. `fields` land in frontmatter; `bodyLines` land verbatim.
// `scope` is hoisted out of `fields` into its canonical slot. Spreading it after a
// hardcoded `scope: []` emitted TWO scope lines; the parser is last-wins so every
// assertion still passed, but the fixture on disk was malformed — and a writer that
// replaced only the first occurrence then left the stale one behind.
export function writeShard(memDir, category, slug, { key, fields = {}, bodyLines = [] }) {
  const dir = join(memDir, category);
  mkdirSync(dir, { recursive: true });
  const { scope = '[]', ...rest } = fields;
  const preamble = [
    `key: ${key ?? slug}`,
    `category: ${category}`,
    `scope: ${scope}`,
    ...Object.entries(rest).map(([k, v]) => `${k}: ${v}`),
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

// buildIndex returns the SessionStart hook envelope, not the markdown it renders.
// Asserting line-anchored patterns against the envelope fails on the escaped
// newlines whatever the index actually says — red, while measuring nothing.
export function additionalContextOf(envelope) {
  return JSON.parse(envelope).hookSpecificOutput.additionalContext;
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
