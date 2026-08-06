// Domain — stamping the stored half of the staleness comparison.
//
// The prior cycle shipped digestFor() and a classify() that reads a STORED digest,
// but nothing ever wrote one, so `reconcile`'s stale branch guarded on
// `element.anchor_digest &&` and was unreachable for every element in the corpus.
// This module is the write path that makes it reachable.
//
// There is deliberately NO stamp-everything entry point (spec D3). Re-stamping on
// a schedule would make classify() permanently green and launder exactly the drift
// the digest exists to catch — the decay-evasion hatch this memory system has
// already removed once. Re-stamping is a curation act: the caller names the ids it
// reviewed, and anything it did not review keeps surfacing as stale.

import { join } from 'node:path';

import { digestFor } from './reconcile.mjs';
import { assertNoTraversal, readAll, writeElement } from './store.mjs';

function elementById(specDir, id) {
  return readAll(specDir).elements.find((element) => element.id === id) ?? null;
}

// A glob names a family, not a file, so there is no single interface to digest —
// classify() already reports these as `moved` and never as `stale`.
function digestable(anchor) {
  return Boolean(anchor) && !anchor.includes('*');
}

export function stampElement(specDir, id, { rootDir = process.cwd() } = {}) {
  const element = elementById(specDir, id);
  if (!element) return { id, digest: null, state: 'unknown' };

  const anchor = assertNoTraversal(element.anchor ?? '');
  if (!digestable(anchor)) return { id, digest: null, state: 'not-applicable' };

  const digest = digestFor(join(rootDir, anchor));
  // Stamping over an unresolved anchor would assert the model matches code that is
  // not there — strictly worse than carrying no digest at all.
  if (digest === null) return { id, digest: null, state: 'dangling' };

  writeElement(specDir, { ...element, anchor_digest: digest });
  return { id, digest, state: 'fresh' };
}

export function stampAll(specDir, ids, options = {}) {
  if (!Array.isArray(ids)) {
    throw new Error('stampAll requires an explicit id list — there is no stamp-everything default (spec D3)');
  }
  const stamped = [];
  const dangling = [];
  for (const id of ids) {
    const result = stampElement(specDir, id, options);
    if (result.state === 'fresh') stamped.push(id);
    else if (result.state === 'dangling') dangling.push(id);
  }
  return { stamped, dangling };
}
