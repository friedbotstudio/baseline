// shard-migration-repair — AC-003 (one lifter, not two). Covers §Design "One lifter,
// not two (R2)".
//
// Adversarial review found shape.mjs:40 holding a byte-identical copy of the
// defective regex, sitting on a WRITE path: sweep.mjs round-trips shards through
// writeShardedFromFlat on every stamp-closure (fired by /commit) and auto-close
// (fired by /memory-sync). Fixing migrate.mjs alone would let the very next commit
// re-strand what the repair just fixed. Two copies of one rule is what produced
// this entire workflow, so the invariant is structural: exactly one definition.
//
// RED until: lift-fields.mjs owns the only regex and both migrate.mjs and shape.mjs
// import it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO_ROOT } from './helpers/memory-fixtures.mjs';

// A field-lifting regex: matches a leading `- `, captures a bracketed name class,
// then `:`. Deliberately shape-based rather than literal so a cosmetic edit
// (adding A-Z, reordering the class) does not slip a second copy past the check.
const LIFTING_REGEX_SHAPE = /\/\^-\\s\+\(\[[^\]]*\]\[[^\]]*\]\*\)\s*:/;

const SCAN_ROOTS = ['.claude/skills', '.claude/hooks', 'src'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'tests', 'references']);

function walkSourceFiles(absDir, acc = []) {
  let entries;
  try {
    entries = readdirSync(absDir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(absDir, name);
    if (statSync(abs).isDirectory()) walkSourceFiles(abs, acc);
    else if (/\.(mjs|js)$/.test(name)) acc.push(abs);
  }
  return acc;
}

function filesDefiningLiftingRegex() {
  const hits = [];
  for (const root of SCAN_ROOTS) {
    for (const abs of walkSourceFiles(join(REPO_ROOT, root))) {
      if (LIFTING_REGEX_SHAPE.test(readFileSync(abs, 'utf8'))) hits.push(relative(REPO_ROOT, abs));
    }
  }
  return hits.sort();
}

describe('lift-fields — exactly one definition repo-wide (AC-003)', () => {
  it('test_when_repo_searched_then_exactly_one_lifting_regex_definition', () => {
    const hits = filesDefiningLiftingRegex();
    assert.deepEqual(
      hits,
      ['.claude/skills/memory-index/lift-fields.mjs'],
      `expected the lifting regex in lift-fields.mjs only; found it in: ${hits.join(', ') || '(nowhere)'}`,
    );

    for (const consumer of [
      '.claude/skills/memory-index/migrate.mjs',
      '.claude/skills/memory-sync/shape.mjs',
    ]) {
      const text = readFileSync(join(REPO_ROOT, consumer), 'utf8');
      assert.match(text, /from\s+['"].*lift-fields\.mjs['"]/,
        `${consumer} must import the shared lifter rather than carry its own copy`);
    }
  });
});
