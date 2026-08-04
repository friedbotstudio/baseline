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

import { CANONICAL, readLoadBearing } from '../memory-index/categories.mjs';
import { resolveCategory } from '../memory-index/lift-fields.mjs';
import { assertSafeFactKey } from '../memory-index/migrate.mjs';
import { splitFrontmatter } from './store.mjs';

const MARKER = 'load_bearing';

// Spec D1, owner ENGINEER: the marker means the same thing wherever it sits. A gate
// reading only `decisions` left 20 of the 23 markers on disk authorising nothing —
// including every landmine, which is the register that most often marks a seam a
// maintainer would confidently break. The entry's own category is returned with it
// because the marker WRITE has to follow the entry rather than assume a directory.
function findEntry(memDir, key) {
  for (const category of CANONICAL) {
    try {
      const { entries, source } = resolveCategory(memDir, category);
      const entry = entries.find((e) => e.key === key);
      if (entry) return { entry, category, source };
    } catch {
      continue;
    }
  }
  return null;
}

// AC-010. Absent marker and explicit false both decline: annotations go where a
// maintainer would otherwise confidently break something, not broadly.
export function annotationPlacementAllowed(memDir, key) {
  const found = findEntry(memDir, key);
  return found ? readLoadBearing(found.entry.fields) : false;
}

// @decision:load-bearing-marker-requires-engineer-confirmation-2026-08-04
export function proposeLoadBearing({ memDir, key, rationale, confirmed = false } = {}) {
  // CWE-22, security review F-1. `findEntry` matches on the DECLARED frontmatter
  // `key:`, not the filename, so a shard named innocently can carry
  // `key: ../../victim/target` and steer the write out of the store entirely.
  // Validate before the lookup and before any path is built — REJECT, never
  // normalize, exactly as writeConstraint does after F-5.
  assertSafeFactKey(key);
  const found = findEntry(memDir, key);
  if (!found) return { written: false, key, rationale, reason: 'no such entry' };
  if (confirmed !== true) return { written: false, key, rationale, reason: 'awaiting engineer confirmation' };
  // The sharded path is the only one `stampMarker` can rewrite; on a flat store
  // `<category>/<key>.md` never existed, and letting readFileSync raise ENOENT would
  // turn a shape the store still supports into a crash.
  if (found.source !== 'sharded') {
    return { written: false, key, rationale, reason: `flat ${found.category} store: the marker write needs a sharded store` };
  }

  stampMarker(join(memDir, found.category, `${key}.md`));
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
