// Foundation — the only module in this skill that touches the filesystem or
// parses frontmatter. Everything else composes it.
//
// The corpus lives UNDER .claude/memory/ but is deliberately NOT a ninth canonical
// category (spec §Migration): CANONICAL is untouched, so no reader that walks
// canonical categories ever sees these files.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { asList } from '../memory-index/categories.mjs';
import { assertSafeFactKey, assertSafeFieldValue } from '../memory-index/migrate.mjs';

const LIST_FIELDS = new Set(['governed_by', 'rests_on', 'includes']);

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
  assertSafeFactKey(element?.id);
  const dir = join(workspaceDir(memDir), 'elements');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${element.id}.md`);
  writeFileSync(path, renderElement(element), 'utf8');
  return path;
}

function renderElement(element) {
  const { id, kind = 'component', title = id, anchor = '', body = '', ...rest } = element;
  const fields = [['kind', kind], ['title', title], ['anchor', anchor]];
  for (const [name, value] of Object.entries(rest)) {
    fields.push([name, Array.isArray(value) ? value.join(',') : value]);
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
