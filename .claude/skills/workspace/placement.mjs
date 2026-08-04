// Domain — annotation placement policy (AC-010, AC-011).
//
// Spec decision D5, owner ENGINEER: Claude may PROPOSE load_bearing: with cited
// rationale, but the marker does not stick without engineer confirmation. That
// marker decides where annotations land in real source, so an unaided wrong call
// either scatters comments across code nobody will break, or withholds them from
// the one place a maintainer would confidently break something.
//
// The confirmation check is `=== true`, not truthiness: a caller passing a
// non-empty string, an object, or a stray 1 has not obtained engineer consent,
// and a gate that accepts a truthy accident is not a gate.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readLoadBearing } from '../memory-index/categories.mjs';
import { resolveCategory } from '../memory-index/lift-fields.mjs';
import { assertSafeFactKey } from '../memory-index/migrate.mjs';
import { splitFrontmatter } from './store.mjs';

const MARKER = 'load_bearing';

function findEntry(memDir, key) {
  try {
    return resolveCategory(memDir, 'decisions').entries.find((entry) => entry.key === key) ?? null;
  } catch {
    return null;
  }
}

// AC-010. Absent marker and explicit false both decline: annotations go where a
// maintainer would otherwise confidently break something, not broadly.
export function annotationPlacementAllowed(memDir, key) {
  const entry = findEntry(memDir, key);
  return entry ? readLoadBearing(entry.fields) : false;
}

export function proposeLoadBearing({ memDir, key, rationale, confirmed = false } = {}) {
  // CWE-22, security review F-1. `findEntry` matches on the DECLARED frontmatter
  // `key:`, not the filename, so a shard named innocently can carry
  // `key: ../../victim/target` and steer the write out of the store entirely.
  // Validate before the lookup and before any path is built — REJECT, never
  // normalize, exactly as writeConstraint does after F-5.
  assertSafeFactKey(key);
  const entry = findEntry(memDir, key);
  if (!entry) return { written: false, key, rationale, reason: 'no such decision entry' };
  if (confirmed !== true) return { written: false, key, rationale, reason: 'awaiting engineer confirmation' };

  stampMarker(join(memDir, 'decisions', `${key}.md`));
  return { written: true, key, rationale };
}

// Bounded to the frontmatter block. An unanchored rewrite would match a BODY line
// quoting the field while documenting the schema — routine in this corpus, and
// the exact shape of security review F-2.
function stampMarker(path) {
  const text = readFileSync(path, 'utf8');
  const split = splitFrontmatter(text);
  if (!split) return;

  const front = split.front.filter((line) => !new RegExp(`^${MARKER}:`).test(line));
  front.push(`${MARKER}: true`);
  writeFileSync(path, `---\n${front.join('\n')}\n---\n${split.body}`, 'utf8');
}
