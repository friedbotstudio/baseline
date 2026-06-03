// Shared fixtures for the Tier 2/3 memory-capture tests.
// Foundation: tmp transcript/_pending/_thread builders + corpus loader + a
// dynamic-import guard for modules/exports that don't exist until implemented.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

export { existsSync, join };
