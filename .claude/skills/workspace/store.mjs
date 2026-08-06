// Foundation — corpus record IO. Reads and writes the files the model OWNS.
//
// The corpus lives UNDER .claude/memory/ but is deliberately NOT a ninth canonical
// category (spec §Migration): CANONICAL is untouched, so no reader that walks
// canonical categories ever sees these files.
//
// Two responsibilities were split out rather than left here: the working tree the
// model points AT (tree.mjs) and the record wire format (record-codec.mjs). This
// module now answers exactly one question — what is in the corpus, and how does a
// record get there. The re-exports below keep every existing importer working; the
// split moved code, not contracts.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertSafeFactKey } from '../memory-index/migrate.mjs';
import { parseEntry, renderRecord } from './record-codec.mjs';

export { assertNoTraversal, readSourceText, walkFiles } from './tree.mjs';
export { splitFrontmatter } from './record-codec.mjs';

function workspaceDir(memDir) {
  return join(memDir, 'workspace');
}

// Preflight only — deliberately does NOT create. AC-012: an absent workspace is a
// reported error, never a directory quietly conjured mid-contribution, because a
// half-initialized store is worse than none.
export function ensureWorkspace(memDir) {
  const dir = workspaceDir(memDir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { ready: false, reason: `workspace not initialized at ${dir}` };
  }
  return { ready: true };
}

export function readRecords(memDir, kind) {
  return readCollection(memDir, kind);
}

// Enumerating shard FILES is a different question from enumerating element
// RECORDS: an orphan shard is precisely a file with no record behind it, so it can
// only be found by listing the directory.
export function listWorkspaceFiles(memDir, kind, ext) {
  const dir = join(workspaceDir(memDir), kind);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir).filter((name) => name.endsWith(ext)).sort();
}

function readCollection(memDir, kind) {
  const dir = join(workspaceDir(memDir), kind);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    // Per-ENTRY isolation: a malformed file is skipped, its siblings still read.
    // A per-DIRECTORY try would silently blank the whole corpus (security F-1).
    try {
      const entry = parseEntry(readFileSync(join(dir, name), 'utf8'));
      if (entry) out.push(entry);
    } catch {
      continue;
    }
  }
  return out;
}

export function readAll(memDir) {
  return {
    elements: readCollection(memDir, 'elements').map(withGranularity),
    views: readCollection(memDir, 'views'),
  };
}

// Granularity is a FUNCTION of anchor shape, never a stored field (spec D1). A
// glob names a family, a path names one file, and an absent anchor names nothing
// on disk — so the three cases are readable off the anchor alone.
function withGranularity(element) {
  const anchor = element.anchor ?? '';
  if (!anchor) return { ...element, granularity: 'concept' };
  return { ...element, granularity: anchor.includes('*') ? 'subsystem' : 'component' };
}

// Both are derivable at read — granularity from the anchor above, the shard path
// by convention in shards.mjs — so persisting either would create a second source
// of truth that can disagree with the first. `anchor_digest` is deliberately NOT
// here: comparing a STORED digest against a fresh one is the whole mechanism, so
// it is the one field that cannot be re-derived at read time.
const DERIVED_FIELDS = ['granularity', 'shard'];

export function writeElement(memDir, element) {
  const persisted = { ...element };
  for (const field of DERIVED_FIELDS) delete persisted[field];
  return writeRecord(memDir, 'elements', persisted, ['kind', 'title', 'anchor']);
}

export function writeRecord(memDir, kind, record, order) {
  assertSafeFactKey(record?.id);
  const dir = join(workspaceDir(memDir), kind);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${record.id}.md`);
  writeFileSync(path, renderRecord(record, order), 'utf8');
  return path;
}

// Foundation owns every filesystem touch, so the delete lives here rather than in
// contribute.mjs — a Domain module reaching for node:fs directly is the layer
// violation this split exists to prevent.
export function removeElement(memDir, id) {
  assertSafeFactKey(id);
  const path = join(workspaceDir(memDir), 'elements', `${id}.md`);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}
