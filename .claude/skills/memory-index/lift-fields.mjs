// Foundation — the single field-lifting rule for the memory store, plus the
// serializer that is `frontmatter-parser`'s exact inverse and the shape-agnostic
// category resolver every reader routes through.
//
// Why an allowlist rather than a case-insensitive regex: the old rule anchored the
// field name to lowercase as a HEURISTIC separating metadata (`- verified-at:`)
// from prose labels (`- Path:`). The corpus writes both capitalized, so relaxing
// the case would hoist ~420 prose bullets into frontmatter. Capitalization never
// separated the classes — `- Source:` is capitalized metadata, `- Path:` is
// capitalized prose — so the discriminator is the NAME, against a closed list.
//
// Membership rule: a name is liftable iff a named mechanical consumer reads it.
// Adding one requires naming that consumer in the same commit.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from '../../hooks/lib/frontmatter-parser.mjs';

// `- name: value` — the one definition in the repo. Case-insensitive by class,
// bounded by LIFTABLE_FIELDS below rather than by the character class.
const FIELD_BULLET = /^-\s+([A-Za-z][A-Za-z-]*):\s+(.+)$/;

export const LIFTABLE_FIELDS = new Set([
  'verified-at',      // memory_session_start isStale(), sweep.mjs — Art. IX.5 decay
  'last-touched',     // memory_session_start isStale(), sweep.mjs — decay fallback
  'status',           // closure-check.mjs, sweep.mjs — backlog closure state
  'superseded-at',    // closure-check.mjs, sweep.mjs — closure stamp
  'resolved-at',      // sweep.mjs — closure stamp, pending-questions only
  'source',           // /memory-flush verbatim gate — Art. IX.6 provenance
  'raised-on',        // sweep.mjs modeBacklogDecay
]);

// Owned by the emitted preamble: a body bullet of these names is dropped, never
// lifted, or the preamble would carry the key twice.
export const STRUCTURAL_FIELDS = new Set(['key', 'category', 'scope']);

import { CANONICAL as CANONICAL_CATEGORIES } from './categories.mjs';

export function splitBodyLines(blockBody) {
  const lines = String(blockBody ?? '').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Separate a block body into liftable frontmatter fields and the body that stays.
// `existingFrontmatter` lets the caller detect a lift that would overwrite a key
// already present — equal values dedup, differing values are a Collision the
// caller must refuse. No mechanical rule can pick a winner between two different
// meanings sharing one name, so this never guesses (REJECT, never normalize).
export function liftFields(blockBody, existingFrontmatter = {}) {
  const fields = [];
  const bodyLines = [];
  const collisions = [];

  for (const line of splitBodyLines(blockBody)) {
    const match = FIELD_BULLET.exec(line.trim());
    if (!match) {
      bodyLines.push(line);
      continue;
    }
    const name = match[1].toLowerCase();
    const value = match[2];

    if (STRUCTURAL_FIELDS.has(name)) continue;
    if (!LIFTABLE_FIELDS.has(name)) {
      bodyLines.push(line);
      continue;
    }

    const existing = existingFrontmatter?.[name];
    if (existing === undefined) {
      fields.push([name, value]);
      continue;
    }
    if (String(existing) === value) continue;
    collisions.push({ field: name, frontmatterValue: String(existing), bodyValue: value });
    bodyLines.push(line);
  }

  return { fields, bodyLines, collisions };
}

class FrontmatterRoundTripError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FrontmatterRoundTripError';
  }
}

function assertScalarRoundTrips(key, value) {
  if (typeof value !== 'string') {
    throw new FrontmatterRoundTripError(
      `cannot round-trip ${key}: only strings and string arrays are representable — `
      + `a ${typeof value} re-parses as a string, silently changing its type`);
  }
  if (/\n/.test(value)) {
    throw new FrontmatterRoundTripError(
      `cannot round-trip ${key}: value contains a newline and the preamble is line-oriented`);
  }
  if (value !== value.trim()) {
    throw new FrontmatterRoundTripError(
      `cannot round-trip ${key}: leading/trailing whitespace is lost by the parser`);
  }
  if (/^\[.*\]$/.test(value)) {
    throw new FrontmatterRoundTripError(
      `cannot round-trip ${key}: a string in [brackets] would be coerced back to an array`);
  }
}

function emitValue(key, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      // Array items get the SAME guards as scalars, not just the comma check. An
      // item containing a newline would close the value and open a forged key —
      // `scope: ['a\nsource: user-instruction']` injects `source`, the value the
      // Art. IX.6 verbatim gate keys on. Security review 2026-07-20, CWE-93.
      assertScalarRoundTrips(key, item);
      if (item.includes(',')) {
        throw new FrontmatterRoundTripError(
          `cannot round-trip ${key}: an array item contains a comma and the parser splits on commas`);
      }
    }
    return `[${value.join(', ')}]`;
  }
  assertScalarRoundTrips(key, value);
  return value;
}

// Exact inverse of parseFrontmatter's preamble parse. Raises rather than silently
// coercing a value it cannot represent — a lossy write here is invisible until a
// reader reports the wrong thing months later.
export function emitFrontmatter(map) {
  const lines = [];
  for (const [key, value] of Object.entries(map ?? {})) {
    if (key.startsWith('#')) {
      throw new FrontmatterRoundTripError(`cannot round-trip ${key}: the parser skips #-leading lines`);
    }
    if (value === '') {
      lines.push(`${key}:`);
      continue;
    }
    lines.push(`${key}: ${emitValue(key, value)}`);
  }
  return lines.join('\n');
}

export { FrontmatterRoundTripError };

function readShardEntries(dir, category) {
  const entries = [];
  const degraded = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const text = readFileSync(join(dir, file), 'utf8');
    const { frontmatter, body } = parseFrontmatter(text);
    if (!frontmatter.key) {
      degraded.push(`unparseable-entry:${category}/${file}`);
      continue;
    }
    entries.push(toEntry(frontmatter.key, category, frontmatter, body));
  }
  return { entries, degraded };
}

function readFlatEntries(path, category) {
  const text = readFileSync(path, 'utf8');
  const withoutPreamble = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const entries = [];
  for (const part of withoutPreamble.split(/^## /m).slice(1)) {
    const newline = part.indexOf('\n');
    const key = (newline === -1 ? part : part.slice(0, newline)).trim();
    const body = newline === -1 ? '' : part.slice(newline + 1);
    if (key) entries.push(toEntry(key, category, {}, body));
  }
  return { entries, degraded: [] };
}

// A flat entry keeps its metadata as body bullets; a sharded one keeps it in
// frontmatter. `fields` is the merged read-only view so a consumer asking for
// `status` gets the same answer from either shape.
//
// This deliberately does NOT reuse liftFields: that is the WRITE-path policy,
// which drops structural names because the emitted preamble owns them and bounds
// lifting to the reader-backed allowlist. On the READ path a flat entry's
// `- scope: [spec]` bullet IS the data, and a caller asking for `scope` must get
// it. Same regex, different policy — see parseFieldBullet.
function toEntry(key, category, frontmatter, body) {
  const fields = { ...frontmatter };
  for (const line of splitBodyLines(body)) {
    const bullet = parseFieldBullet(line);
    if (!bullet) continue;
    const name = bullet.name.toLowerCase();
    if (fields[name] === undefined) fields[name] = parseFieldValue(bullet.value);
  }
  return { key, category, frontmatter, body, fields };
}

// Match the frontmatter parser's scalar rule so `[a, b]` reads as an array from
// either shape.
function parseFieldValue(raw) {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return raw;
}

// SHARD-FIRST. A failed migrateForward writes every shard, asserts, and only then
// removes the flat source — so both shapes coexist precisely when the migration
// broke, and the shards are the newer truth. Flat-first would serve stale data in
// exactly the state where correctness matters most.
export function resolveCategory(memRoot, category) {
  const dir = join(memRoot, category);
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    const { entries, degraded } = readShardEntries(dir, category);
    return { entries, source: 'sharded', degraded };
  }
  const flat = join(memRoot, `${category}.md`);
  if (existsSync(flat)) {
    const { entries, degraded } = readFlatEntries(flat, category);
    return { entries, source: 'flat', degraded };
  }
  return { entries: [], source: 'absent', degraded: [] };
}

// Every allowlisted bullet still sitting in a body, across the whole store. The
// decay predicate cannot see these, which is what made 127 entries permanently
// fresh; sweep.mjs uses this as its precondition.
export function strandedFieldBullets(memRoot) {
  const stranded = [];
  for (const category of CANONICAL_CATEGORIES) {
    const { entries, source } = resolveCategory(memRoot, category);
    if (source !== 'sharded') continue;
    for (const entry of entries) {
      for (const line of splitBodyLines(entry.body)) {
        const match = FIELD_BULLET.exec(line.trim());
        if (!match) continue;
        const name = match[1].toLowerCase();
        if (LIFTABLE_FIELDS.has(name)) stranded.push({ category, entryKey: entry.key, field: name, line: line.trim() });
      }
    }
  }
  return stranded;
}

// Parse one `- name: value` bullet with the single shared regex. Callers apply
// their own lifting POLICY on top: migrate/relift lift only LIFTABLE_FIELDS out of
// author-written prose, while shape.mjs round-trips the bullets factToBlock itself
// emitted (frontmatter keys, always lowercase) and must put every one of them back
// or a sweep would silently demote fields to body text. One regex, two policies,
// both explicit.
export function parseFieldBullet(line) {
  const match = FIELD_BULLET.exec(String(line).trim());
  return match ? { name: match[1], value: match[2] } : null;
}

export { CANONICAL_CATEGORIES, FIELD_BULLET };
