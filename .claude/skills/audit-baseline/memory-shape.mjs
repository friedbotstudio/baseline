// Foundation — recognize the sharded memory shape (seven category directories +
// three continuity trails) so audit-baseline can validate a migrated store
// (AC-006). Reads only inside the given memory root — never the Claude Code
// session-level MEMORY.md store outside .claude/memory (intake non-goal).

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CANONICAL_CATEGORIES = [
  'landmarks', 'libraries', 'decisions', 'landmines',
  'conventions', 'pending-questions', 'backlog',
];

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
