// Foundation — recognize the sharded memory shape (every CANONICAL category
// directory + three continuity trails) so audit-baseline can validate a migrated
// store (AC-006). The count is deliberately not written out here: it was "seven"
// while CANONICAL held eight, which is the same stale-local-copy drift the import
// below exists to prevent. Reads only inside the given memory root — never the
// Claude Code session-level MEMORY.md store outside .claude/memory (intake non-goal).

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Imported rather than re-listed: line 31 gates on
// `categories === CANONICAL_CATEGORIES.length`, so a local copy left one entry
// behind turns a correctly-registered store into an audit FAIL.
import { CANONICAL as CANONICAL_CATEGORIES } from '../memory-index/categories.mjs';

const CONTINUITY_TRAILS = ['_resume', '_thread', '_pending'];

function isDir(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

export function checkMemoryShape(memRoot) {
  const missing = [];
  let categories = 0;
  for (const category of CANONICAL_CATEGORIES) {
    if (isDir(join(memRoot, category))) categories += 1;
    else missing.push(category);
  }
  let trails = 0;
  for (const trail of CONTINUITY_TRAILS) {
    if (existsSync(join(memRoot, `${trail}.md`))) trails += 1;
  }
  return { ok: categories === CANONICAL_CATEGORIES.length, categories, trails, missing };
}
