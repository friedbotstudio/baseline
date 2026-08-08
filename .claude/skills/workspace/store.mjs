// Foundation — corpus record IO. Reads and writes the files the model OWNS.
//
// The corpus is a docs/ SPEC artifact, not a ninth canonical category: CANONICAL is
// untouched and no reader that walks canonical categories ever sees these files.
//
// Two responsibilities were split out rather than left here: the working tree the
// model points AT (tree.mjs) and the record wire format (record-codec.mjs). This
// module now answers exactly one question — what is in the corpus, and how does a
// record get there. The re-exports below keep every existing importer working; the
// split moved code, not contracts.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertSafeSlug } from '../../hooks/lib/slug.mjs';
import { parseEntry, renderRecord } from './record-codec.mjs';
import { assertNoTraversal } from './tree.mjs';

export { assertNoTraversal, readSourceText, walkFiles } from './tree.mjs';
export { splitFrontmatter } from './record-codec.mjs';

// The corpus root IS specDir. There is no intermediate segment to join now that
// the model lives at docs/system/ rather than inside a memory subdirectory.

// Preflight only — deliberately does NOT create. AC-012: an absent workspace is a
// reported error, never a directory quietly conjured mid-contribution, because a
// half-initialized store is worse than none.
export function ensureWorkspace(specDir) {
  if (!existsSync(specDir) || !statSync(specDir).isDirectory()) {
    return { ready: false, reason: `workspace not initialized at ${specDir}` };
  }
  return { ready: true };
}

export function readRecords(specDir, kind) {
  return readCollection(specDir, kind);
}

// Enumerating shard FILES is a different question from enumerating element
// RECORDS: an orphan shard is precisely a file with no record behind it, so it can
// only be found by listing the directory.
export function listWorkspaceFiles(specDir, kind, ext) {
  // Guarded at the sink, matching writeWorkspaceFile two functions below. Both
  // callers used to pass something that could not express traversal — a literal
  // `'diagrams'`, or a `[a-z0-9_-]+` capture out of the README — so the safety
  // lived in the caller's regex rather than here. The CLI front door (spec
  // dispatcher-sweep, W-5) removes that argument: argv is arbitrary. REJECT, never
  // normalize; repairing the segment would write confidently to the wrong place.
  assertNoTraversal(kind);
  const dir = join(specDir, kind);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir).filter((name) => name.endsWith(ext)).sort();
}

// The corpus's only raw-file writer, sited beside listWorkspaceFiles because the
// two answer the same question from opposite ends — what is in a corpus
// subdirectory, and how does something get there. A record goes through
// writeRecord; a `.puml` shard is not a record and has no frontmatter, so it
// needs the primitive rather than the codec. Keeping it here is what lets
// shards.mjs stay a Domain module with no node:fs of its own.
export function writeWorkspaceFile(specDir, kind, name, text) {
  // The read side (tree.readSourceText) has always opened with this; the write side
  // is where an escaped segment gets a `mkdirSync -r` behind it, so it guards too.
  assertNoTraversal(kind);
  assertNoTraversal(name);
  const dir = join(specDir, kind);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, text, 'utf8');
  return path;
}

function readCollection(specDir, kind) {
  const dir = join(specDir, kind);
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

export function readAll(specDir) {
  return {
    elements: readCollection(specDir, 'elements').map(withGranularity),
    views: readCollection(specDir, 'views'),
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

export function writeElement(specDir, element) {
  const persisted = { ...element };
  for (const field of DERIVED_FIELDS) delete persisted[field];
  return writeRecord(specDir, 'elements', persisted, ['kind', 'title', 'anchor']);
}

export function writeRecord(specDir, kind, record, order) {
  assertSafeSlug(record?.id, 'element id');
  const dir = join(specDir, kind);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${record.id}.md`);
  writeFileSync(path, renderRecord(record, order), 'utf8');
  return path;
}

// Foundation owns every filesystem touch, so the delete lives here rather than in
// contribute.mjs — a Domain module reaching for node:fs directly is the layer
// violation this split exists to prevent.
export function removeElement(specDir, id) {
  assertSafeSlug(id, 'element id');
  const path = join(specDir, 'elements', `${id}.md`);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}
