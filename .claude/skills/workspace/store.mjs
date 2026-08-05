// Foundation — the only module in this skill that touches the filesystem or
// parses frontmatter. Everything else composes it.
//
// The corpus lives UNDER .claude/memory/ but is deliberately NOT a ninth canonical
// category (spec §Migration): CANONICAL is untouched, so no reader that walks
// canonical categories ever sees these files.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { asList } from '../memory-index/categories.mjs';
import { assertSafeFactKey, assertSafeFieldValue } from '../memory-index/migrate.mjs';

const LIST_FIELDS = new Set(['governed_by', 'rests_on', 'includes', 'members']);

function workspaceDir(memDir) {
  return join(memDir, 'workspace');
}

// A `..` segment in an anchor or a member id escapes the tree the corpus is
// contracted to describe. REJECT, never normalize — the same register as
// assertSafeFactKey, and for the same reason: silently rewriting the path would
// read a different file than the author named.
export function assertNoTraversal(rel) {
  const text = String(rel ?? '');
  if (text.split(/[\\/]/).includes('..')) {
    throw new Error(`unsafe path traversal (REJECT, never normalize): ${JSON.stringify(text)}`);
  }
  return text;
}

// Reading the WORKING TREE, not the corpus. It lives here because this module is
// the skill's only filesystem surface; a Domain scanner reaching for node:fs is
// the layer violation that split exists to prevent.
export function readSourceText(rootDir, rel) {
  assertNoTraversal(rel);
  const path = join(rootDir, rel);
  try {
    return statSync(path).isFile() ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
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

// Split a file into [frontmatter lines, body]. Bounded to the leading block: an
// unanchored scan would read a BODY line shaped like a field as frontmatter, the
// same defect security review F-2 found in resolve.mjs.
export function splitFrontmatter(text) {
  const lines = String(text).split('\n');
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return { front: lines.slice(1, i), body: lines.slice(i + 1).join('\n') };
    }
  }
  return null;
}

function parseEntry(text) {
  const split = splitFrontmatter(text);
  if (!split) return null;
  const fields = {};
  for (const line of split.front) {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (!match) continue;
    const [, name, raw] = match;
    fields[name] = LIST_FIELDS.has(name) ? asList(raw) : raw.trim();
  }
  return fields.id ? { ...fields, body: split.body } : null;
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
  return { elements: readCollection(memDir, 'elements'), views: readCollection(memDir, 'views') };
}

export function writeElement(memDir, element) {
  return writeRecord(memDir, 'elements', element, ['kind', 'title', 'anchor']);
}

// `order` names the fields that lead the frontmatter and get a default. A concept
// passes ['kind','title','members'] and therefore never renders an `anchor:` —
// granularity is derived from anchor SHAPE (spec D1), so a concept carrying an
// empty anchor would be read as a component.
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

const RECORD_DEFAULTS = { kind: 'component', anchor: '', members: [] };

function renderRecord(record, order = ['kind', 'title', 'anchor']) {
  const { id, body = '', ...given } = record;
  const fields = order.map((name) => [
    name,
    given[name] ?? (name === 'title' ? id : RECORD_DEFAULTS[name] ?? ''),
  ]);
  for (const [name, value] of Object.entries(given)) {
    if (!order.includes(name)) fields.push([name, value]);
  }
  // `id` is already bounded by assertSafeFactKey; every other name and value is
  // interpolated straight into line-delimited frontmatter (security review F-2).
  const front = [`id: ${id}`];
  for (const [name, value] of fields) {
    assertSafeFieldValue(name, value);
    front.push(`${name}: ${value}`);
  }
  return `---\n${front.join('\n')}\n---\n\n${body}\n`;
}
