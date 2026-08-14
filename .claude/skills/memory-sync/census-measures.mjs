// Foundation — the named measures a census site can be pinned to.
//
// A site declares WHICH count it holds by name rather than by carrying its own
// counting code, so the gate stays a gate and the arithmetic has one home. A
// measure counts the store as it will be AFTER the flush: the entries on disk
// plus the pending ones about to be written, which is what makes the re-measure
// correct in the same commit rather than one flush behind.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MEASURES = {
  'landmarks-with-scope-scout': (rootDir, pending) =>
    onDiskWithScoutScope(rootDir, 'landmarks') + pendingWithScoutScope(pending, 'landmarks'),
};

export function countMeasure(rootDir, measure, pendingEntries = []) {
  const counter = MEASURES[measure];
  if (!counter) throw new UnknownMeasureError(measure);
  return counter(rootDir, pendingEntries);
}

export class UnknownMeasureError extends Error {
  constructor(measure) {
    super(`unknown census measure: ${measure}`);
    this.name = 'UnknownMeasureError';
  }
}

function onDiskWithScoutScope(rootDir, category) {
  const dir = join(rootDir, '.claude/memory', category);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .filter((name) => /^scope:\s*\[scout\]\s*$/m.test(readFileSync(join(dir, name), 'utf8')))
    .length;
}

function pendingWithScoutScope(pending, category) {
  return pending.filter((entry) => entry.category === category
    && Array.isArray(entry.scope)
    && entry.scope.length === 1
    && entry.scope[0] === 'scout').length;
}
